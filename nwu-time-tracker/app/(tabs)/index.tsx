import React, { useState, useEffect, useRef } from "react";
import { View, Text, Button, Alert, FlatList, Dimensions, SafeAreaView, StyleSheet, TouchableOpacity } from "react-native";
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

// Function to format date with day name
const formatDateWithDay = (dateString: string): string => {
  const date = dayjs(dateString);
  return `${date.format("DD-MM-YYYY")} | ${date.format("dddd")}`;
};

// Function to calculate expected check out time
const getExpectedCheckOutTime = (checkInTime: string, dateString: string): string => {
  const checkIn = dayjs(checkInTime);
  const dayOfWeek = dayjs(dateString).day();
  const requiredHours = dayOfWeek === 5 ? 4 : 5; // Friday is 5 in dayjs (0=Sunday)
  
  return checkIn.add(requiredHours, 'hour').format("hh:mm A");
};

export default function HomeScreen() {
  const [db, setDb] = useState<any>(null);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [weeklyHours, setWeeklyHours] = useState<number>(0);
  const [expectedCheckOut, setExpectedCheckOut] = useState<string | null>(null);
  const [hasActiveCheckIn, setHasActiveCheckIn] = useState<boolean>(false);
  const reminderShownRef = useRef(false); // Track if reminder has been shown

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

    // Check if there's an active check-in and calculate expected check out time
    const activePunch = rows.find((p: Punch) => !p.checkOut);
    if (activePunch) {
      const expectedTime = getExpectedCheckOutTime(activePunch.checkIn, activePunch.date);
      setExpectedCheckOut(expectedTime);
      setHasActiveCheckIn(true);
    } else {
      setExpectedCheckOut(null);
      setHasActiveCheckIn(false);
    }
  };

  // Check if daily requirements are met - FIXED: Only check once and only for today
  useEffect(() => {
    const checkToday = async () => {
      // Only check once per app session
      if (reminderShownRef.current) return;
      
      const today = dayjs().format("YYYY-MM-DD");
      const todayPunch = punches.find(p => p.date === today && p.checkOut);
      
      // Only show reminder if there's a completed punch for today that doesn't meet requirements
      if (todayPunch) {
        const hours = todayPunch.duration || 0;
        const dayOfWeek = dayjs().day();
        const required = dayOfWeek === 5 ? 4 : 5; // Friday is 5 in dayjs (0=Sunday)
        
        if (hours < required) {
          reminderShownRef.current = true; // Mark as shown
          Alert.alert(
            "Reminder", 
            `You have ${formatDuration(hours)} today but need ${formatDuration(required)}`
          );
        }
      }
    };
    
    // Only check if we have punches and the app is already initialized
    if (punches.length > 0 && db) {
      checkToday();
    }
  }, [punches, db]);

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
    // Prevent duplicate check-in
    if (hasActiveCheckIn) {
      Alert.alert(
        "Already Checked In",
        "You already have an active check-in. Please check out first before checking in again."
      );
      return;
    }
    
    const success = await handleAuth();
    if (!success) return;
    const now = dayjs();
    await db.runAsync(
      "INSERT INTO punches (date, checkIn, checkOut, duration) VALUES (?, ?, ?, ?)",
      [now.format("YYYY-MM-DD"), now.toISOString(), null, 0]
    );
    loadPunches(db);
    
    // Show expected check out time after check in
    const dayOfWeek = now.day();
    const requiredHours = dayOfWeek === 5 ? 4 : 5;
    const expectedTime = now.add(requiredHours, 'hour').format("hh:mm A");
    
    Alert.alert(
      "Checked In Successfully",
      `You need to complete ${requiredHours} hours today.\nExpected check out time: ${expectedTime}`
    );
  };

  const handleCheckOut = async () => {
    const success = await handleAuth();
    if (!success) return;
    const latest = punches.find((p) => !p.checkOut);
    if (!latest) {
      Alert.alert("No active check-in", "You don't have any active check-in to check out from.");
      return;
    }
    const now = dayjs();
    const duration = dayjs(now).diff(dayjs(latest.checkIn), "hour", true);
    await db.runAsync(
      "UPDATE punches SET checkOut = ?, duration = ? WHERE id = ?",
      [now.toISOString(), duration, latest.id]
    );
    loadPunches(db);
    
    // Check if requirement was met - FIXED: Use color coding instead of symbols
    const dayOfWeek = dayjs(latest.date).day();
    const requiredHours = dayOfWeek === 5 ? 4 : 5;
    const metRequirement = duration >= requiredHours;
    
    Alert.alert(
      "Checked Out Successfully",
      `You worked for ${formatDuration(duration)} today.\nRequirement: ${requiredHours} hours\nStatus: ${metRequirement ? "Met" : "Not Met"}`,
      [{ text: "OK" }]
    );
  };

  // Function to clear all data from database
  const clearDatabase = async () => {
    Alert.alert(
      "Clear All Data",
      "Are you sure you want to delete all time tracking data? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        { 
          text: "Delete All", 
          onPress: async () => {
            try {
              await db.runAsync("DELETE FROM punches");
              loadPunches(db);
              Alert.alert("Success", "All data has been cleared.");
            } catch (error) {
              Alert.alert("Error", "Failed to clear data.");
            }
          },
          style: "destructive"
        }
      ]
    );
  };

  // Get only the last 15 punches for display
  const recentPunches = punches.slice(0, 15);

  const { width } = Dimensions.get('window');
  const isTablet = width > 600;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#fff",
    },
    content: {
      flex: 1,
      padding: isTablet ? 40 : 20,
    },
    title: {
      fontSize: isTablet ? 32 : 24,
      fontWeight: "bold",
      marginBottom: 10,
    },
    weeklyText: {
      marginBottom: 10,
      fontSize: isTablet ? 18 : 16,
      fontWeight: "bold",
    },
    expectedTime: {
      marginBottom: 15,
      fontSize: isTablet ? 16 : 14,
      fontWeight: "bold",
      color: "#2196F3",
    },
    buttonContainer: {
      flexDirection: isTablet ? 'row' : 'column',
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
    historyLimit: {
      fontSize: isTablet ? 14 : 12,
      color: "#666",
      marginBottom: 10,
      fontStyle: "italic",
    },
    listItem: {
      padding: 10,
      borderBottomWidth: 1,
      borderColor: "#ccc",
      marginVertical: 5,
    },
    listDate: {
      fontWeight: "bold",
      fontSize: isTablet ? 16 : 14,
      marginBottom: 5,
    },
    timeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 3,
    },
    timeText: {
      fontSize: isTablet ? 14 : 12,
    },
    separator: {
      marginHorizontal: 5,
      fontSize: isTablet ? 14 : 12,
    },
    durationText: {
      fontSize: isTablet ? 14 : 12,
    },
    metRequirement: {
      color: "green",
      fontWeight: "bold",
    },
    missedRequirement: {
      color: "red",
      fontWeight: "bold",
    },
    clearButton: {
      marginTop: 10,
      padding: 10,
      backgroundColor: "#ff4444",
      borderRadius: 5,
      alignItems: "center",
    },
    clearButtonText: {
      color: "white",
      fontWeight: "bold",
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity onLongPress={clearDatabase}>
          <Text style={styles.title}>NWU Time Tracker</Text>
        </TouchableOpacity>
        
        <Text style={[
          styles.weeklyText,
          weeklyHours >= 36 ? styles.metRequirement : styles.missedRequirement
        ]}>
          Weekly Total: {formatDuration(weeklyHours)} / 36 hours
        </Text>

        {expectedCheckOut && (
          <Text style={styles.expectedTime}>
            Expected Check Out: {expectedCheckOut}
          </Text>
        )}

        <View style={styles.buttonContainer}>
          <Button 
            title="Check In" 
            onPress={handleCheckIn} 
            disabled={hasActiveCheckIn} // Disable button when already checked in
          />
          <View style={styles.buttonSpacer} />
          <Button 
            title="Check Out" 
            onPress={handleCheckOut} 
            disabled={!hasActiveCheckIn} // Disable button when no active check-in
          />
        </View>

        {/* Clear Data Button - Uncomment to make visible */}
        {/* <TouchableOpacity style={styles.clearButton} onPress={clearDatabase}>
          <Text style={styles.clearButtonText}>Clear All Data</Text>
        </TouchableOpacity> */}

        <Text style={styles.historyTitle}>History</Text>
        <Text style={styles.historyLimit}>Showing last 15 entries</Text>
        <FlatList
          data={recentPunches}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.listItem}>
              <Text style={styles.listDate}>
                {formatDateWithDay(item.date)}
              </Text>
              
              {item.checkOut ? (
                <>
                  <View style={styles.timeContainer}>
                    <Text style={styles.timeText}>
                      In: {dayjs(item.checkIn).format("hh:mm A")}
                    </Text>
                    <Text style={styles.separator}>|</Text>
                    <Text style={styles.timeText}>
                      Out: {dayjs(item.checkOut).format("hh:mm A")}
                    </Text>
                  </View>
                  <Text style={
                    item.duration >= (dayjs(item.date).day() === 5 ? 4 : 5) 
                      ? [styles.durationText, styles.metRequirement]
                      : [styles.durationText, styles.missedRequirement]
                  }>
                    Duration: {formatDuration(item.duration)}
                  </Text>
                </>
              ) : (
                <View style={styles.timeContainer}>
                  <Text style={styles.timeText}>
                    In: {dayjs(item.checkIn).format("hh:mm A")}
                  </Text>
                  <Text style={styles.separator}>|</Text>
                  <Text style={styles.timeText}>Status: Active</Text>
                </View>
              )}
            </View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}