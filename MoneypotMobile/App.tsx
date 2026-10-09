import React from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { DataProvider } from './src/context/DataContext';
import { TodayScreen } from './src/screens/TodayScreen';
import { PlansScreen } from './src/screens/PlansScreen';
import { PotsScreen } from './src/screens/PotsScreen';
import { StashesScreen } from './src/screens/StashesScreen';
import { AccountsScreen } from './src/screens/AccountsScreen';
import { LogbookScreen } from './src/screens/LogbookScreen';
import { CashflowScreen } from './src/screens/CashflowScreen';
import { theme } from './src/theme';
import { triggerHaptic } from './src/utils/haptics';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <DataProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarActiveTintColor: theme.colors.brand,
              tabBarInactiveTintColor: theme.colors.mute,
              tabBarStyle: {
                backgroundColor: '#FFFFFF',
                borderTopColor: theme.colors.line,
                borderTopWidth: 1,
                height: Platform.OS === 'android' ? 64 : 84,
                paddingBottom: Platform.OS === 'android' ? 8 : 24,
                paddingTop: 6,
                ...theme.shadowCard,
              },
              tabBarLabelStyle: {
                fontSize: 10,
                fontWeight: '700',
                marginTop: 2,
              },
            })}
            screenListeners={{
              tabPress: () => {
                triggerHaptic('light');
              },
            }}
          >
            <Tab.Screen
              name="Today"
              component={TodayScreen}
              options={{
                tabBarLabel: 'Today',
                tabBarIcon: ({ focused }) => (
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>✅</Text>
                ),
              }}
            />
            <Tab.Screen
              name="Plans"
              component={PlansScreen}
              options={{
                tabBarLabel: 'Plans',
                tabBarIcon: ({ focused }) => (
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>🗓️</Text>
                ),
              }}
            />
            <Tab.Screen
              name="Pots"
              component={PotsScreen}
              options={{
                tabBarLabel: 'Pots',
                tabBarIcon: ({ focused }) => (
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>🫙</Text>
                ),
              }}
            />
            <Tab.Screen
              name="Stashes"
              component={StashesScreen}
              options={{
                tabBarLabel: 'Stashes',
                tabBarIcon: ({ focused }) => (
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>🐷</Text>
                ),
              }}
            />
            <Tab.Screen
              name="Accounts"
              component={AccountsScreen}
              options={{
                tabBarLabel: 'Accounts',
                tabBarIcon: ({ focused }) => (
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>💳</Text>
                ),
              }}
            />
            <Tab.Screen
              name="Logbook"
              component={LogbookScreen}
              options={{
                tabBarLabel: 'Logbook',
                tabBarIcon: ({ focused }) => (
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>📜</Text>
                ),
              }}
            />
            <Tab.Screen
              name="Cashflow"
              component={CashflowScreen}
              options={{
                tabBarLabel: 'Cashflow',
                tabBarIcon: ({ focused }) => (
                  <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>📈</Text>
                ),
              }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </DataProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    fontSize: 18,
    opacity: 0.7,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.15 }],
  },
});
