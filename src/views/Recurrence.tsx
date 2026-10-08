import { addDays, dayLabel, dueDates, monthDaysOf, NTH, ord, parse, today, WEEKDAYS, WEEKDAYS_LONG, weekdaysOf } from '../schedule';
import type { Plan } from '../types';
import { Field, Seg } from '../ui';

const toggle = (arr: number[], v: number) =>
  arr.includes(v) ? (arr.length > 1 ? arr.filter(x => x !== v) : arr) : [...arr, v].sort((a, b) => a - b);

/** Flexible schedule picker with a live "next dates" preview */
export function RecurrenceEditor({ p, set }: { p: Plan; set: (x: Partial<Plan>) => void }) {
  const unit = { once: '', daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[p.freq];
  const wd = weekdaysOf(p), md = monthDaysOf(p);
  const t = today();
  const next = dueDates(p, t > p.startDate ? t : p.startDate, addDays(t, 800)).slice(0, 4);

  return (
    <>
      <Field label="How often?">
        <Seg value={p.freq} onChange={f => set({ freq: f })}
          options={[['once', 'Once'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]} />
      </Field>

      {p.freq !== 'once' && (
        <div className="inline">
          Every <input className="num" type="number" min={1} value={p.every} onChange={e => set({ every: Math.max(1, +e.target.value) })} /> {unit}{p.every > 1 ? 's' : ''}
        </div>
      )}

      {p.freq === 'weekly' && (
        <Field label="On these days">
          <div className="chips">
            {[1, 2, 3, 4, 5, 6, 0].map(d => <button type="button" key={d} className={wd.includes(d) ? 'chip on' : 'chip'} onClick={() => set({ weekdays: toggle(wd, d) })}>{WEEKDAYS[d]}</button>)}
          </div>
        </Field>
      )}

      {p.freq === 'monthly' && (
        <>
          <Seg value={p.monthMode ?? 'dates'} onChange={m => set({ monthMode: m })} options={[['dates', 'On specific dates'], ['weekday', 'On a weekday']]} />
          {p.monthMode === 'weekday' ? (
            <div className="row">
              <Field label="Which one">
                <select value={p.nth ?? 1} onChange={e => set({ nth: +e.target.value })}>
                  {[1, 2, 3, 4, -1].map(n => <option key={n} value={n}>{NTH[n]}</option>)}
                </select>
              </Field>
              <Field label="Day">
                <select value={p.nthWeekday ?? parse(p.startDate).getDay()} onChange={e => set({ nthWeekday: +e.target.value })}>
                  {[1, 2, 3, 4, 5, 6, 0].map(d => <option key={d} value={d}>{WEEKDAYS_LONG[d]}</option>)}
                </select>
              </Field>
            </div>
          ) : (
            <Field label="On these dates" hint="Pick one or more. 31 falls on the last day in shorter months.">
              <div className="days">
                {[...Array(31)].map((_, i) => <button type="button" key={i} className={md.includes(i + 1) ? 'on' : ''} onClick={() => set({ monthDays: toggle(md, i + 1) })}>{i + 1}</button>)}
                <button type="button" className={`last ${md.includes(-1) ? 'on' : ''}`} onClick={() => set({ monthDays: toggle(md, -1) })}>Last day</button>
              </div>
            </Field>
          )}
        </>
      )}

      <div className="row">
        <Field label={p.freq === 'once' ? 'Date' : 'Starting'}><input type="date" value={p.startDate} onChange={e => set({ startDate: e.target.value })} /></Field>
        {p.freq !== 'once' && <Field label="Until (optional)"><input type="date" value={p.endDate ?? ''} onChange={e => set({ endDate: e.target.value || undefined })} /></Field>}
      </div>

      {p.freq !== 'once' && (
        <div className="preview">📅 {next.length ? <>Next: <b>{next.map(dayLabel).join(' · ')}</b></> : 'No upcoming dates with these settings'}
          {p.freq === 'monthly' && p.monthMode !== 'weekday' && md.length > 1 && <> — {md.map(x => (x === -1 ? 'last day' : ord(x))).join(' & ')}</>}
        </div>
      )}
    </>
  );
}
