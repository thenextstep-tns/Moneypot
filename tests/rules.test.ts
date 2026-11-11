// Firestore security rules tests. Run with:  npm run test:rules
// (starts the Firestore emulator via the Firebase CLI; needs Java)
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { FieldPath, arrayRemove, arrayUnion, collection, collectionGroup, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { createHash } from 'node:crypto';

let env: RulesTestEnvironment;
const SID = 'sh_abcdefghjkmnpqrs2345';
const CODE = 'MP7KQ2XH9D';
const IID = createHash('sha256').update(CODE).digest('hex');

const as = (uid: string, email?: string) =>
  env.authenticatedContext(uid, email ? { email, email_verified: true } : {}).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-moneypot',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

async function seedSharedItemAndInvite(inviteeEmail = 'b@example.com') {
  const a = as('alice', 'a@example.com');
  await assertSucceeds(setDoc(doc(a, 'shared_items', SID), {
    id: SID, type: 'stash', ownerId: 'alice', memberIds: ['alice'], members: { alice: { email: 'a@example.com' } }, data: { name: 'Trip' },
  }));
  await assertSucceeds(setDoc(doc(a, 'invites', IID), {
    id: IID, ownerId: 'alice', sharedId: SID, targetType: 'stash', targetName: 'Trip', targetEmoji: '✈️', inviterEmail: 'a@example.com',
    inviteeEmail, status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 7 * 864e5,
  }));
}

const accept = (db: ReturnType<typeof as>, uid: string, email: string) =>
  updateDoc(doc(db, 'invites', IID), { status: 'accepted', acceptedByUid: uid, acceptedByEmail: email, acceptedAt: Date.now() });
const join = (db: ReturnType<typeof as>, uid: string, email: string) =>
  updateDoc(doc(db, 'shared_items', SID), 'memberIds', arrayUnion(uid), new FieldPath('members', uid), { email }, 'joinInviteId', IID, 'updatedAt', Date.now());

test('personal data is private', async () => {
  const a = as('alice');
  const b = as('bob');
  await assertSucceeds(setDoc(doc(a, 'users/alice/payments/p1'), { id: 'p1', amount: 5 }));
  await assertSucceeds(getDoc(doc(a, 'users/alice/payments/p1')));
  await assertFails(getDoc(doc(b, 'users/alice/payments/p1')));
  await assertFails(setDoc(doc(b, 'users/alice/payments/evil'), { id: 'evil', amount: 1e6 }));
  await assertFails(setDoc(doc(b, 'users/alice/categories/food'), { id: 'food', sharedWith: ['b@example.com'] }));
  await assertFails(getDocs(collection(b, 'users/alice/transfers')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/alice/payments/p1')));
});

test('legacy open collections and collection-group invite scans are closed', async () => {
  const b = as('bob');
  await assertFails(getDocs(collection(b, 'shared_payments')));
  await assertFails(setDoc(doc(b, 'shared_stashes/x'), { a: 1 }));
  await assertFails(getDocs(collectionGroup(b, 'invites')));
  await assertFails(getDocs(collection(b, 'invites')));
});

test('shared items are visible to members only', async () => {
  await seedSharedItemAndInvite();
  await assertSucceeds(getDocs(query(collection(as('alice'), 'shared_items'), where('memberIds', 'array-contains', 'alice'))));
  await assertFails(getDoc(doc(as('bob', 'b@example.com'), 'shared_items', SID)));
  await assertFails(getDocs(collection(as('bob'), 'shared_items', SID, 'payments')));
});

test('an invite can be accepted once, by the invited email only, then used to join', async () => {
  await seedSharedItemAndInvite();
  const bob = as('bob', 'b@example.com');
  const carol = as('carol', 'c@example.com');
  await assertSucceeds(getDoc(doc(carol, 'invites', IID))); // knowing the code lets you look…
  await assertFails(accept(carol, 'carol', 'c@example.com')); // …but not accept someone else's invite
  await assertFails(join(bob, 'bob', 'b@example.com')); // can't join before accepting
  await assertSucceeds(accept(bob, 'bob', 'b@example.com'));
  await assertFails(accept(carol, 'carol', 'c@example.com')); // already used
  await assertFails(join(carol, 'carol', 'c@example.com')); // carol can't ride on bob's invite
  await assertSucceeds(join(bob, 'bob', 'b@example.com'));
  await assertSucceeds(getDoc(doc(bob, 'shared_items', SID)));
  // members can add their own records, not impersonate others
  await assertSucceeds(setDoc(doc(bob, 'shared_items', SID, 'transfers', 't1'), { id: 't1', contributorUid: 'bob', toAmount: 10 }));
  await assertFails(setDoc(doc(bob, 'shared_items', SID, 'transfers', 't2'), { id: 't2', contributorUid: 'alice', toAmount: 10 }));
  await assertFails(getDocs(collection(carol, 'shared_items', SID, 'transfers')));
  // members can't take over ownership or add people
  await assertFails(updateDoc(doc(bob, 'shared_items', SID), { ownerId: 'bob' }));
  await assertFails(updateDoc(doc(bob, 'shared_items', SID), 'memberIds', arrayUnion('carol')));
  // members can edit the shared fields; the owner can moderate records and remove members
  await assertSucceeds(updateDoc(doc(bob, 'shared_items', SID), { data: { name: 'Tokyo trip', target: 3000 }, updatedAt: Date.now() }));
  const alice = as('alice', 'a@example.com');
  await assertSucceeds(getDocs(collection(alice, 'shared_items', SID, 'transfers')));
  await assertSucceeds(updateDoc(doc(alice, 'shared_items', SID, 'transfers', 't1'), { toAmount: 12 }));
  await assertFails(updateDoc(doc(alice, 'shared_items', SID, 'transfers', 't1'), { contributorUid: 'alice' }));
  // and can leave
  await assertSucceeds(updateDoc(doc(bob, 'shared_items', SID), 'memberIds', arrayRemove('bob'), new FieldPath('members', 'bob'), deleteField(), 'updatedAt', Date.now()));
  await assertFails(getDoc(doc(bob, 'shared_items', SID)));
  // the owner can delete the records and the item
  await assertFails(deleteDoc(doc(bob, 'shared_items', SID)));
  await assertSucceeds(deleteDoc(doc(alice, 'shared_items', SID, 'transfers', 't1')));
  await assertSucceeds(deleteDoc(doc(alice, 'shared_items', SID)));
});

test('the owner can remove a member', async () => {
  await seedSharedItemAndInvite();
  const bob = as('bob', 'b@example.com');
  await assertSucceeds(accept(bob, 'bob', 'b@example.com'));
  await assertSucceeds(join(bob, 'bob', 'b@example.com'));
  await assertSucceeds(updateDoc(doc(as('alice'), 'shared_items', SID), 'memberIds', arrayRemove('bob'), new FieldPath('members', 'bob'), deleteField(), 'updatedAt', Date.now()));
  await assertFails(getDoc(doc(bob, 'shared_items', SID)));
});

test('open (email-less) invites work for any signed-in user, including Discord accounts', async () => {
  await seedSharedItemAndInvite('');
  const dave = as('discord:123456789');
  await assertSucceeds(accept(dave, 'discord:123456789', ''));
  await assertSucceeds(join(dave, 'discord:123456789', ''));
});

test('expired invites cannot be accepted and owners cannot add members without an invite', async () => {
  await seedSharedItemAndInvite();
  await env.withSecurityRulesDisabled(async ctx => {
    await updateDoc(doc(ctx.firestore(), 'invites', IID), { expiresAt: Date.now() - 1000 });
  });
  await assertFails(accept(as('bob', 'b@example.com'), 'bob', 'b@example.com'));
  await assertFails(updateDoc(doc(as('alice'), 'shared_items', SID), 'memberIds', arrayUnion('mallory'), new FieldPath('members', 'mallory'), { email: 'm@x.com' }));
});

test('invites cannot be created for items you do not own, nor listed by others', async () => {
  await seedSharedItemAndInvite();
  const bob = as('bob', 'b@example.com');
  const otherId = createHash('sha256').update('MPAAAABBBB').digest('hex');
  await assertFails(setDoc(doc(bob, 'invites', otherId), {
    id: otherId, ownerId: 'bob', sharedId: SID, inviteeEmail: '', status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 1000,
  }));
  await assertFails(getDocs(query(collection(bob, 'invites'), where('ownerId', '==', 'alice'))));
  await assertSucceeds(getDocs(query(collection(as('alice'), 'invites'), where('ownerId', '==', 'alice'), where('sharedId', '==', SID))));
});
