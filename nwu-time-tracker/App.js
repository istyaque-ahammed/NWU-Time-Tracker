// App.js
// NWU Time Tracker – React Native (Expo)
// Features: Check In / Check Out with fingerprint auth, daily & weekly hours, local history
// Works offline with SQLite. Week: Mon–Sat; Sunday holiday. Weekly target: 36 hrs.

import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView, View, Text, Pressable, FlatList, Alert, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SQLite from 'expo-sqlite';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import duration from 'dayjs/plugin/duration';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

dayjs.extend(isoWeek);
dayjs.extend(duration);

// --- SQLite helpers ---
const db = SQLite.openDatabase('nwu_time.db');

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        sql,
        params,
        (_, res) => resolve(res),
        (_, err) => { reject(err); return true; }
      );
    });
  });
}

async function initDB() {
  await runSql(`CREATE TABLE IF NOT EXISTS punches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'in' | 'out'
    ts TEXT NOT NULL,   -- ISO timestamp
    d TEXT NOT NULL,    -- YYYY-MM-DD (local)
    week_start TEXT NOT NULL -- Monday of that week
  );`);
}

// Get Monday for a date (Sunday is holiday; week counted Mon–Sun, but we use Mon start)
function mondayOfWeek(d = dayjs()) {
  const dow = d.day(); // 0=Sun,1=Mon,...
  const delta = dow === 0 ? -6 : 1 - dow; // move to Monday; if Sunday -> previous Monday
  return d.add(delta, 'day').startOf('day');
}

async function getLastPunch() {
  const res = await runSql('SELECT * FROM punches ORDER BY id DESC LIMIT 1');
  return res.rows.length ? res.rows.item(0) : null;
}

async function addPunch(type) {
  const now = dayjs();
  const d = now.format('YYYY-MM-DD');
  const weekStart = mondayOfWeek(now).format('YYYY-MM-DD');
  await runSql('INSERT INTO punches (type, ts, d, week_start) VALUES (?,?,?,?)', [type, now.toISOString(), d, weekStart]);
}

async function getPunchesForDate(dStr) {
  const res = await runSql('SELECT * FROM punches WHERE d = ? ORDER BY ts ASC', [dStr]);
  const out = []; for (let i=0;i<res.rows.length;i++) out.push(res.rows.item(i));
  return out;
}

async function getPunchesForWeek(weekStartStr) {
  const res = await runSql('SELECT * FROM punches WHERE week_start = ? ORDER BY ts ASC', [weekStartStr]);
  const out = []; for (let i=0;i<res.rows.length;i++) out.push(res.rows.item(i));
  return out;
}

function computeHoursFromPunches(punches) {
  // Expect alternating in/out pairs. Ignore unmatched trailing 'in'.
  let totalMs = 0;
  let lastIn = null;
  punches.forEach(p => {
    if (p.type === 'in') {
      lastIn = dayjs(p.ts);
    } else if (p.type === 'out' && lastIn) {
      const outT = dayjs(p.ts);
      if (outT.isAfter(lastIn)) {
        totalMs += outT.diff(lastIn);
      }
      lastIn = null;
    }
  });
  const hours = totalMs / (1000*60*60);
  return hours;
}

function formatHours(h) {
  const ms = h * 3600 * 1000;
  const dur = dayjs.duration(ms);
  const hh = Math.floor(dur.asHours());
  const mm = dur.minutes().toString().padStart(2, '0');
  return `${hh}h ${mm}m`;
}

async function ensureBiometric() {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) throw new Error('No biometric hardware');
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) throw new Error('No fingerprint/biometric enrolled');
  const prompt = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Verify to continue',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });
  if (!prompt.success) throw new Error(prompt.warning || 'Authentication failed');
}

function useTotals() {
  const [todayHours, setTodayHours] = useState(0);
  const [weekHours, setWeekHours] = useState(0);
  const [status, setStatus] = useState('OUT');

  const refresh = useCallback(async () => {
    await initDB();
    const now = dayjs();
    const dStr = now.format('YYYY-MM-DD');
    const wStr = mondayOfWeek(now).format('YYYY-MM-DD');

    const todayPunches = await getPunchesForDate(dStr);
    const weekPunches = await getPunchesForWeek(wStr);
    setTodayHours(computeHoursFromPunches(todayPunches));
    setWeekHours(computeHoursFromPunches(weekPunches));

    const last = todayPunches.length ? todayPunches[todayPunches.length-1] : (await getLastPunch());
    setStatus(last && last.type === 'in' ? 'IN' : 'OUT');
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { todayHours, weekHours, status, refresh };
}

function Button({ onPress, children, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => ({
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 16,
      backgroundColor: disabled ? '#d1d5db' : pressed ? '#4b5563' : '#111827',
      marginVertical: 8,
    })}>
      <Text style={{ color: 'white', fontSize: 16, textAlign: 'center', fontWeight: '600' }}>{children}</Text>
    </Pressable>
  );
}

function Card({ title, value, subtitle, highlight }) {
  return (
    <View style={{ backgroundColor: '#f9fafb', padding: 16, borderRadius: 16, marginVertical: 8, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:8, elevation:2 }}>
      <Text style={{ fontSize: 12, color: '#6b7280' }}>{title}</Text>
      <Text style={{ fontSize: 24, fontWeight: '700', color: highlight ? '#064e3b' : '#111827', marginTop: 6 }}>{value}</Text>
      {subtitle ? <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{subtitle}</Text> : null}
    </View>
  );
}

function HomeScreen() {
  const { todayHours, weekHours, status, refresh } = useTotals();

  const handlePunch = async (type) => {
    try {
      await ensureBiometric();
      const last = await getLastPunch();
      if (type === 'in') {
        if (last && last.type === 'in') {
          Alert.alert('Already Checked In', 'You must check out before checking in again.');
          return;
        }
        // Disallow check-in on Sunday to avoid accidental logs
        if (dayjs().day() === 0) {
          Alert.alert('Sunday Holiday', 'Sunday is a holiday (no work hours required).');
          return;
        }
      }
      if (type === 'out') {
        if (!last || last.type !== 'in') {
          Alert.alert('Not Checked In', 'You need to check in first.');
          return;
        }
      }
      await addPunch(type);
      await refresh();
    } catch (e) {
      Alert.alert('Authentication Required', e.message || 'Could not verify identity.');
    }
  };

  const weeklyTarget = 36; // hours
  const weekdayMin = 5;
  const fridayMin = 4;
  const todayIsFriday = dayjs().day() === 5;
  const minToday = todayIsFriday ? fridayMin : weekdayMin;

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 12 }}>NWU Time Tracker</Text>
      <Card title={`Status`} value={status === 'IN' ? 'Checked In' : 'Checked Out'} subtitle={`Tap a button to ${status === 'IN' ? 'Check Out' : 'Check In'}.`} />
      <Card title={`Today (${dayjs().format('ddd, MMM D')})`} value={formatHours(todayHours)} subtitle={`Target ≥ ${minToday}h`} highlight={todayHours >= minToday} />
      <Card title={`This Week (from ${mondayOfWeek().format('MMM D')})`} value={formatHours(weekHours)} subtitle={`Target ≥ ${weeklyTarget}h`} highlight={weekHours >= weeklyTarget} />

      <Button onPress={() => handlePunch('in')} disabled={status === 'IN'}>Check In (Fingerprint)</Button>
      <Button onPress={() => handlePunch('out')} disabled={status === 'OUT'}>Check Out (Fingerprint)</Button>

      <Text style={{ marginTop: 16, color: '#6b7280' }}>Notes: Mon–Thu, Sat ≥ 5h; Fri ≥ 4h; Weekly ≥ 36h.</Text>
    </SafeAreaView>
  );
}

function HistoryScreen() {
  const [items, setItems] = useState([]);
  const [weekSummary, setWeekSummary] = useState([]);

  const load = useCallback(async () => {
    await initDB();
    const res = await runSql('SELECT * FROM punches ORDER BY ts DESC LIMIT 200');
    const arr = []; for (let i=0;i<res.rows.length;i++) arr.push(res.rows.item(i));
    setItems(arr);

    // Weekly aggregates (last 8 weeks)
    const wRes = await runSql(`SELECT week_start, GROUP_CONCAT(type||'@'||ts,'|') AS punches FROM punches GROUP BY week_start ORDER BY week_start DESC LIMIT 8`);
    const w = []; for (let i=0;i<wRes.rows.length;i++) w.push(wRes.rows.item(i));
    const wk = w.map(row => {
      const punches = (row.punches || '').split('|').filter(Boolean).map(t => {
        const [type, ts] = t.split('@');
        return { type, ts };
      }).sort((a,b)=> dayjs(a.ts).valueOf()-dayjs(b.ts).valueOf());
      const hours = computeHoursFromPunches(punches);
      return { week_start: row.week_start, hours };
    });
    setWeekSummary(wk);
  }, []);

  useEffect(() => { load(); }, [load]);

  const renderItem = ({ item }) => (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
      <Text style={{ fontWeight: '600' }}>{item.type.toUpperCase()} • {dayjs(item.ts).format('MMM D, YYYY • h:mm A')}</Text>
      <Text style={{ color: '#6b7280' }}>Day: {item.d} • Week start: {item.week_start}</Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 8 }}>History</Text>
      <FlatList data={items} keyExtractor={(it) => String(it.id)} renderItem={renderItem} />
      <Text style={{ fontSize: 18, fontWeight: '800', marginVertical: 12 }}>Weekly Summary</Text>
      {weekSummary.map(w => (
        <View key={w.week_start} style={{ backgroundColor: '#f3f4f6', padding: 12, borderRadius: 12, marginBottom: 8 }}>
          <Text style={{ fontWeight: '700' }}>Week of {dayjs(w.week_start).format('MMM D, YYYY')}</Text>
          <Text>{formatHours(w.hours)}</Text>
        </View>
      ))}
    </SafeAreaView>
  );
}

function ReportsScreen() {
  const [byDay, setByDay] = useState([]);

  const load = useCallback(async () => {
    await initDB();
    // Compute last 14 days totals
    const res = await runSql(`SELECT d, GROUP_CONCAT(type||'@'||ts,'|') AS punches FROM punches GROUP BY d ORDER BY d DESC LIMIT 14`);
    const arr = []; for (let i=0;i<res.rows.length;i++) arr.push(res.rows.item(i));
    const rows = arr.map(r => {
      const punches = (r.punches || '').split('|').filter(Boolean).map(t => {
        const [type, ts] = t.split('@');
        return { type, ts };
      }).sort((a,b)=> dayjs(a.ts).valueOf()-dayjs(b.ts).valueOf());
      const hours = computeHoursFromPunches(punches);
      return { d: r.d, hours };
    });
    setByDay(rows);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Reports (Last 14 Days)</Text>
      {byDay.map(r => (
        <View key={r.d} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
          <Text>{dayjs(r.d).format('ddd, MMM D')}</Text>
          <Text>{formatHours(r.hours)}</Text>
        </View>
      ))}
      <Text style={{ marginTop: 12, color: '#6b7280' }}>Tip: Aim for ≥5h (Mon–Thu, Sat) and ≥4h (Fri); ≥36h per week.</Text>
    </SafeAreaView>
  );
}

const Tab = createBottomTabNavigator();

export default function App() {
  useEffect(() => { initDB(); }, []);

  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Reports" component={ReportsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// --- Setup Notes ---
// 1) Install Expo CLI: npm i -g expo-cli
// 2) Initialize: npx create-expo-app nwu-time-tracker
// 3) Replace App.js with this file.
// 4) Install deps:
//    npm i dayjs @react-navigation/native @react-navigation/bottom-tabs
//    npx expo install expo-local-authentication expo-sqlite react-native-screens react-native-safe-area-context
// 5) Run: npx expo start
// 6) On first launch, enroll fingerprint/biometrics on device (Settings).
