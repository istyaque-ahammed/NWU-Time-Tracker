import React, { useState, useEffect, useRef } from "react";
import { 
  View, 
  Text, 
  Alert, 
  FlatList, 
  Dimensions, 
  SafeAreaView, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  useColorScheme,
  Image
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SQLite from "expo-sqlite";
import dayjs from "dayjs";
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Progress from 'react-native-progress';

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
  return `${hours}h ${minutes}m`;
};

const formatDateWithDay = (dateString: string): string => {
  const date = dayjs(dateString);
  return `${date.format("DD-MM-YYYY")} | ${date.format("dddd")}`;
};

const getExpectedCheckOutTime = (checkInTime: string, dateString: string): string => {
  const checkIn = dayjs(checkInTime);
  const dayOfWeek = dayjs(dateString).day();
  const requiredHours = dayOfWeek === 5 ? 4 : 5;
  return checkIn.add(requiredHours, 'hour').format("hh:mm A");
};

export default function HomeScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [db, setDb] = useState<any>(null);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [dailyHours, setDailyHours] = useState<number>(0);
  const [expectedCheckOut, setExpectedCheckOut] = useState<string | null>(null);
  const [hasActiveCheckIn, setHasActiveCheckIn] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState(dayjs());
  const reminderShownRef = useRef(false);

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
      loadPunches(database, currentTime);
    };
    initDb();
  }, []);

  // Update current time every second for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(dayjs());

    return () => clearInterval(interval);
  }, []);

  // Reload punches when currentTime changes (for real-time updates)
  useEffect(() => {
    if (db) {
      loadPunches(db, currentTime);
    }
  }, [currentTime, db]);

  const loadPunches = async (database: any, currentTime: dayjs.Dayjs) => {
    const rows = await database.getAllAsync("SELECT * FROM punches ORDER BY id DESC");
    setPunches(rows);

    // Calculate daily hours for today
    const today = dayjs().format("YYYY-MM-DD");
    const todayPunch = rows.find((p: Punch) => p.date === today);
    let todayHours = 0;

    if (todayPunch) {
      if (todayPunch.checkOut) {
        // Already checked out - use stored duration
        todayHours = todayPunch.duration;
      } else {
        // Active check-in - calculate current duration in real-time
        const checkInTime = dayjs(todayPunch.checkIn);
        todayHours = currentTime.diff(checkInTime, "hour", true);
      }
    }

    setDailyHours(todayHours);

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

  useEffect(() => {
    const checkToday = async () => {
      if (reminderShownRef.current) return;
      
      const today = dayjs().format("YYYY-MM-DD");
      const todayPunch = punches.find(p => p.date === today && p.checkOut);
      
      if (todayPunch) {
        const hours = todayPunch.duration || 0;
        const dayOfWeek = dayjs().day();
        const required = dayOfWeek === 5 ? 4 : 5;
        
        if (hours < required) {
          reminderShownRef.current = true;
          Alert.alert(
            "Reminder", 
            `You have ${formatDuration(hours)} today but need ${formatDuration(required)}`
          );
        }
      }
    };
    
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
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasActiveCheckIn) {
      Alert.alert("Already Checked In", "Please check out first before checking in again.");
      return;
    }
    
    const success = await handleAuth();
    if (!success) return;
    const now = dayjs();
    await db.runAsync(
      "INSERT INTO punches (date, checkIn, checkOut, duration) VALUES (?, ?, ?, ?)",
      [now.format("YYYY-MM-DD"), now.toISOString(), null, 0]
    );
    loadPunches(db, currentTime);
    
    const dayOfWeek = now.day();
    const requiredHours = dayOfWeek === 5 ? 4 : 5;
    const expectedTime = now.add(requiredHours, 'hour').format("hh:mm A");
    
    Alert.alert("Checked In Successfully", `You need to complete ${requiredHours} hours today.\nExpected check out time: ${expectedTime}`);
  };

  const handleCheckOut = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
    loadPunches(db, currentTime);
    
    const dayOfWeek = dayjs(latest.date).day();
    const requiredHours = dayOfWeek === 5 ? 4 : 5;
    const metRequirement = duration >= requiredHours;
    
    Alert.alert("Checked Out Successfully", `You worked for ${formatDuration(duration)} today.\nRequirement: ${requiredHours} hours\nStatus: ${metRequirement ? "Met" : "Not Met"}`);
  };

  const clearDatabase = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert("Clear All Data", "Are you sure you want to delete all time tracking data?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete All", 
        onPress: async () => {
          try {
            await db.runAsync("DELETE FROM punches");
            loadPunches(db, currentTime);
            Alert.alert("Success", "All data has been cleared.");
          } catch (error) {
            Alert.alert("Error", "Failed to clear data.");
          }
        },
        style: "destructive"
      }
    ]);
  };

  const recentPunches = punches.slice(0, 15);
  const { width } = Dimensions.get('window');
  const isTablet = width > 600;

  // Calculate today's required hours
  const dayOfWeek = dayjs().day();
  const requiredHoursToday = dayOfWeek === 5 ? 4 : 5;
  const dailyProgress = dailyHours / requiredHoursToday;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#121212' : "#f8f9fa",
    },
    content: {
      flex: 1,
      padding: isTablet ? 20 : 16,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 20,
      marginBottom: 20,
      backgroundColor: isDark ? '#1e1e1e' : '#2c3e50',
      padding: 20,
      borderRadius: 15,
      elevation: 3,
    },
    headerText: {
      color: isDark ? '#fff' : 'white',
      fontSize: 22,
      fontWeight: 'bold',
    },
    logo: {
      width: 40,
      height: 40,
      marginLeft: 10,
    },
    statsCard: {
      backgroundColor: isDark ? '#1e1e1e' : 'white',
      padding: 20,
      borderRadius: 15,
      marginBottom: 20,
      elevation: 2,
      alignItems: 'center',
    },
    dailyText: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 10,
      textAlign: 'center',
    },
    expectedTime: {
      fontSize: 16,
      color: '#3498db',
      fontWeight: '500',
      textAlign: 'center',
      marginTop: 10,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 20,
      gap: 12,
    },
    button: {
      flex: 1,
      backgroundColor: '#3498db',
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      minHeight: 50,
      justifyContent: 'center',
    },
    buttonDisabled: {
      backgroundColor: '#bdc3c7',
    },
    buttonText: {
      color: 'white',
      fontWeight: '600',
      fontSize: 16,
    },
    historyTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 12,
      color: isDark ? '#fff' : '#2c3e50',
    },
    historyLimit: {
      fontSize: 14,
      color: isDark ? '#ccc' : '#7f8c8d',
      marginBottom: 15,
    },
    listItem: {
      backgroundColor: isDark ? '#1e1e1e' : 'white',
      padding: 16,
      borderRadius: 12,
      marginBottom: 10,
      elevation: 1,
    },
    listDate: {
      fontWeight: '600',
      fontSize: 15,
      marginBottom: 8,
      color: isDark ? '#fff' : '#2c3e50',
    },
    timeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
      flexWrap: 'wrap',
    },
    timeText: {
      fontSize: 14,
      color: isDark ? '#ccc' : '#34495e',
    },
    separator: {
      marginHorizontal: 8,
      fontSize: 14,
      color: isDark ? '#555' : '#bdc3c7',
    },
    durationText: {
      fontSize: 14,
      fontWeight: '500',
    },
    metRequirement: {
      color: "#27ae60",
    },
    missedRequirement: {
      color: "#e74c3c",
    },
    iconButton: {
      padding: 8,
    },
    progressLabel: {
      fontSize: 14,
      color: isDark ? '#ccc' : '#7f8c8d',
      marginTop: 5,
    },
    realtimeIndicator: {
      fontSize: 12,
      color: '#3498db',
      marginTop: 5,
      fontStyle: 'italic',
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerText}>NWU Time Tracker</Text>
          <Image 
            source={require("./nwu_logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
  
        </View>

        <View style={styles.statsCard}>
          <Progress.Circle          
            size={80}
            progress={dailyProgress}
            showsText={true}
            color={dailyHours >= requiredHoursToday ? '#27ae60' : '#e74c3c'}
            formatText={() => `${Math.round((dailyHours / requiredHoursToday) * 100)}%`}
            style={{ marginBottom: 10 }}
          />
          <Text style={[
            styles.dailyText,
            dailyHours >= requiredHoursToday ? styles.metRequirement : styles.missedRequirement
          ]}>
            Today: {formatDuration(dailyHours)} / {requiredHoursToday}h
          </Text>
          <Text style={styles.progressLabel}>
            {dayjs().format("dddd")} Requirement
          </Text>
          {hasActiveCheckIn && (
            <Text style={styles.realtimeIndicator}>Updating in real-time</Text>
          )}
          {expectedCheckOut && (
            <Text style={styles.expectedTime}>
              Expected Check Out: {expectedCheckOut}
            </Text>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.button, hasActiveCheckIn && styles.buttonDisabled]}
            onPress={handleCheckIn}
            disabled={hasActiveCheckIn}
            accessibilityLabel="Check In Button"
          >
            <Text style={styles.buttonText}>Check In</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.button, !hasActiveCheckIn && styles.buttonDisabled]}
            onPress={handleCheckOut}
            disabled={!hasActiveCheckIn}
            accessibilityLabel="Check Out Button"
          >
            <Text style={styles.buttonText}>Check Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.historyTitle}>Recent History</Text>
        <Text style={styles.historyLimit}>Showing last 15 entries</Text>
        
        <FlatList
          data={recentPunches}
          scrollEnabled={false}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.listItem}>
              <Text style={styles.listDate}>{formatDateWithDay(item.date)}</Text>
              
              {item.checkOut ? (
                <>
                  <View style={styles.timeContainer}>
                    <Text style={styles.timeText}>In: {dayjs(item.checkIn).format("hh:mm A")}</Text>
                    <Text style={styles.separator}>|</Text>
                    <Text style={styles.timeText}>Out: {dayjs(item.checkOut).format("hh:mm A")}</Text>
                  </View>
                  <Text style={[
                    styles.durationText,
                    item.duration >= (dayjs(item.date).day() === 5 ? 4 : 5) 
                      ? styles.metRequirement 
                      : styles.missedRequirement
                  ]}>
                    Duration: {formatDuration(item.duration)}
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.timeContainer}>
                    <Text style={styles.timeText}>In: {dayjs(item.checkIn).format("hh:mm A")}</Text>
                    <Text style={styles.separator}>|</Text>
                    <Text style={[styles.timeText, {color: '#3498db'}]}>Status: Active</Text>
                  </View>
                  <Text style={[styles.durationText, {color: '#3498db'}]}>
                    Current: {formatDuration(currentTime.diff(dayjs(item.checkIn), "hour", true))}
                  </Text>
                </>
              )}
            </View>
          )}
        />
      </ScrollView>
    </SafeAreaView>
  );
}



/*<TouchableOpacity onPress={clearDatabase} style={styles.iconButton}>
  <Ionicons name="trash-outline" size={24} color={isDark ? '#fff' : "white"} />
  </TouchableOpacity>*/