import React, { useState, useEffect } from "react";
import { View, Text, Button, Alert, FlatList, Dimensions, SafeAreaView, StyleSheet } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SQLite from "expo-sqlite";
import dayjs from "dayjs";

type Punch = {
  id: number;
  checkIn: string;
  checkOut: string | null;
  duration: number;
  date: string;
};

const formatDuration = (decimalHours: number): string => {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${hours} hr ${minutes} min`;
};

export default function HomeScreen() {
  const [db, setDb] = useState<any>(null);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [weeklyHours, setWeeklyHours] = useState<number>(0);

  useEffect(() => {
    const initDb = async () => {
      const database = await SQLite.openDatabaseAsync("nwu_time_tracker.db");
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS punches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT,
          checkIn TEXT,
          checkOut TEXT,
          duration REAL
        );
      `);
      setDb(database);
      loadPunches(database);
    };
    initDb();
  }, []);

  const loadPunches = async (database: any) => {
    const rows = await database.getAllAsync("SELECT * FROM punches ORDER BY id DESC");
    setPunches(rows);

    // Calculate weekly hours
    const startOfWeek = dayjs().startOf("week").add(1, "day"); // Monday
    const endOfWeek = startOfWeek.add(5, "day"); // Saturday
    const weekly = rows
      .filter((p: Punch) =>
        dayjs(p.date).isAfter(startOfWeek.subtract(1, "day")) &&
        dayjs(p.date).isBefore(endOfWeek.add(1, "day"))
      )
      .reduce((acc: number, p: Punch) => acc + (p.duration || 0), 0);
    setWeeklyHours(weekly);
  };

  const handleAuth = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      Alert.alert("No biometric hardware found");
      return false;
    }
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      Alert.alert("No biometrics enrolled");
      return false;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authenticate to proceed",
    });
    return result.success;
  };

  const handleCheckIn = async () => {
    const success = await handleAuth();
    if (!success) return;
    const now = dayjs();
    await db.runAsync(
      "INSERT INTO punches (date, checkIn, checkOut, duration) VALUES (?, ?, ?, ?)",
      [now.format("YYYY-MM-DD"), now.toISOString(), null, 0]
    );
    loadPunches(db);
  };

  const handleCheckOut = async () => {
    const success = await handleAuth();
    if (!success) return;
    const latest = punches.find((p) => !p.checkOut);
    if (!latest) {
      Alert.alert("No active check-in");
      return;
    }
    const now = dayjs();
    const duration = dayjs(now).diff(dayjs(latest.checkIn), "hour", true);
    await db.runAsync(
      "UPDATE punches SET checkOut = ?, duration = ? WHERE id = ?",
      [now.toISOString(), duration, latest.id]
    );
    loadPunches(db);
  };

  const { width } = Dimensions.get('window');
  const isTablet = width > 600; // Simple breakpoint for tablets/larger screens

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#fff",
    },
    content: {
      flex: 1,
      padding: isTablet ? 40 : 20, // Larger padding on tablets
    },
    title: {
      fontSize: isTablet ? 32 : 24, // Scale font sizes
      fontWeight: "bold",
      marginBottom: 10,
    },
    weeklyText: {
      marginBottom: 10,
      fontSize: isTablet ? 18 : 16,
    },
    buttonContainer: {
      flexDirection: isTablet ? 'row' : 'column', // Side-by-side buttons on tablets
      justifyContent: isTablet ? 'space-around' : 'flex-start',
      marginBottom: 20,
    },
    buttonSpacer: {
      marginVertical: isTablet ? 0 : 5,
      marginHorizontal: isTablet ? 10 : 0,
    },
    historyTitle: {
      marginTop: 20,
      fontWeight: "bold",
      fontSize: isTablet ? 20 : 18,
    },
    listItem: {
      fontSize: isTablet ? 16 : 14,
      marginVertical: 5,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>NWU Time Tracker</Text>
        <Text style={styles.weeklyText}>Weekly Total: {formatDuration(weeklyHours)}</Text>

        <View style={styles.buttonContainer}>
          <Button title="Check In" onPress={handleCheckIn} />
          <View style={styles.buttonSpacer} />
          <Button title="Check Out" onPress={handleCheckOut} />
        </View>

        <Text style={styles.historyTitle}>History</Text>
        <FlatList
          data={punches}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <Text style={styles.listItem}>
              {item.date} → In: {dayjs(item.checkIn).format("hh:mm A")}
              {item.checkOut
                ? ` | Out: ${dayjs(item.checkOut).format("hh:mm A")} | ${formatDuration(item.duration)}`
                : " | Active"}
            </Text>
          )}
        />
      </View>
    </SafeAreaView>
  );
}