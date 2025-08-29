import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Dimensions, SafeAreaView, StyleSheet, TouchableOpacity, ScrollView, useColorScheme } from "react-native";
import * as SQLite from "expo-sqlite";
import dayjs from "dayjs";
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Progress from 'react-native-progress';
import { useFocusEffect } from "@react-navigation/native";

type Punch = {
  id: number;
  date: string;
  duration: number;
};

const formatDuration = (decimalHours: number): string => {
  const hours = Math.floor(decimalHours);
  const minutes = Math.round((decimalHours - hours) * 60);
  return `${hours}h ${minutes}m`;
};

const formatDateWithDay = (dateString: string): string => {
  const date = dayjs(dateString);
  return date.format("ddd, MMM D");
};

export default function WeeklyReport() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [weeklyData, setWeeklyData] = useState<
    { day: string; date: string; total: number; required: number; met: boolean }[]
  >([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(dayjs().startOf("week").add(1, "day"));
  const [grouped, setGrouped] = useState<{ [key: string]: number }>({});
  const [weeklyMet, setWeeklyMet] = useState(false);
  const [totalHours, setTotalHours] = useState(0);
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);

  // Initialize database once
  useEffect(() => {
    const initDb = async () => {
      try {
        const database = await SQLite.openDatabaseAsync("nwu_time_tracker.db");
        setDb(database);
      } catch (error) {
        console.error("Error initializing database:", error);
      }
    };
    initDb();
  }, []);

  // Load data function
  const loadData = useCallback(async () => {
    if (!db) return;
    
    try {
      const rows = await db.getAllAsync("SELECT * FROM punches");
      const newGrouped: { [key: string]: number } = {};
      
      rows.forEach((p: any) => {
        newGrouped[p.date] = (newGrouped[p.date] || 0) + (p.duration || 0);
      });
      
      setGrouped(newGrouped);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  }, [db]);

  // 🔄 Reload data whenever screen gains focus or db changes
  useFocusEffect(
    useCallback(() => {
      if (db) {
        loadData();
      }
    }, [db, loadData])
  );

  // 🔧 Recalculate weekly data whenever grouped or currentWeekStart changes
  useEffect(() => {
    const days = Array.from({ length: 6 }).map((_, i) => {
      const date = currentWeekStart.add(i, "day");
      const total = grouped[date.format("YYYY-MM-DD")] || 0;
      const required = i === 4 ? 4 : 5;
      return {
        day: date.format("dddd"),
        date: date.format("YYYY-MM-DD"),
        total,
        required,
        met: total >= required,
      };
    });

    setWeeklyData(days);
    const hours = days.reduce((acc, item) => acc + item.total, 0);
    setTotalHours(hours);
    setWeeklyMet(hours >= 36);
  }, [currentWeekStart, grouped]);

  const handlePreviousWeek = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentWeekStart(currentWeekStart.subtract(7, "day"));
  };

  const handleNextWeek = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextStart = currentWeekStart.add(7, "day");
    if (nextStart.isBefore(dayjs().add(1, "week"))) {
      setCurrentWeekStart(nextStart);
    }
  };

  const { width } = Dimensions.get('window');
  const isTablet = width > 600;

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
      backgroundColor: isDark ? '#1e1e1e' : '#2c3e50',
      padding: 20,
      borderRadius: 15,
      marginTop: 20,
      marginBottom: 16,
      alignItems: 'center',
    },
    title: {
      fontSize: 22,
      fontWeight: 'bold',
      color: isDark ? '#fff' : 'white',
      textAlign: 'center',
    },
    weekTitle: {
      fontSize: 16,
      color: isDark ? '#ccc' : '#ecf0f1',
      textAlign: 'center',
      marginTop: 5,
    },
    navContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 16,
      gap: 12,
    },
    navButton: {
      backgroundColor: isDark ? '#2d2d2d' : '#3498db',
      padding: 16,
      borderRadius: 12,
      flex: 1,
      alignItems: 'center',
      minHeight: 50,
      justifyContent: 'center',
    },
    navButtonText: {
      color: isDark ? '#fff' : 'white',
      fontWeight: '600',
      fontSize: 14,
    },
    statsCard: {
      backgroundColor: isDark ? '#1e1e1e' : 'white',
      borderRadius: 15,
      padding: 20,
      marginBottom: 16,
      alignItems: 'center',
      elevation: 2,
    },
    progressContainer: {
      alignItems: 'center',
      marginBottom: 15,
    },
    listContainer: {
      backgroundColor: isDark ? '#1e1e1e' : 'white',
      borderRadius: 15,
      padding: 16,
      marginBottom: 16,
      elevation: 2,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#333' : '#ecf0f1',
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    leftContainer: {
      flex: 1,
    },
    dayHeader: {
      fontSize: 13,
      fontWeight: 'bold',
      color: isDark ? '#888' : '#7f8c8d',
      marginBottom: 4,
    },
    dateText: {
      fontSize: 15,
      fontWeight: '500',
      color: isDark ? '#fff' : '#2c3e50',
    },
    hoursText: {
      fontSize: 15,
      fontWeight: '500',
      textAlign: 'right',
      minWidth: 100,
    },
    totalText: {
      fontSize: 18,
      fontWeight: 'bold',
      textAlign: 'center',
      color: isDark ? '#fff' : '#2c3e50',
    },
    metRequirement: {
      color: "#27ae60",
    },
    missedRequirement: {
      color: "#e74c3c",
    },
    emptyState: {
      alignItems: 'center',
      padding: 40,
    },
    emptyStateText: {
      fontSize: 16,
      color: isDark ? '#888' : '#7f8c8d',
      textAlign: 'center',
      marginTop: 10,
    },
    loadingText: {
      textAlign: 'center',
      color: isDark ? '#ccc' : '#7f8c8d',
      marginBottom: 16,
    },
  });

  const weeklyProgress = totalHours / 36;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Weekly Report</Text>
          <Text style={styles.weekTitle}>
            {currentWeekStart.format("MMM D")} - {currentWeekStart.add(5, 'day').format("MMM D")}
          </Text>
        </View>
        
        <View style={styles.navContainer}>
          <TouchableOpacity 
            style={styles.navButton} 
            onPress={handlePreviousWeek}
            accessibilityLabel="Previous Week"
          >
            <Text style={styles.navButtonText}>Previous Week</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.navButton} 
            onPress={handleNextWeek}
            accessibilityLabel="Next Week"
          >
            <Text style={styles.navButtonText}>Next Week</Text>
          </TouchableOpacity>
        </View>

        {!db ? (
          <Text style={styles.loadingText}>Loading database...</Text>
        ) : (
          <>
            <View style={styles.statsCard}>
              <View style={styles.progressContainer}>
                <Progress.Circle
                  size={80}
                  progress={weeklyProgress}
                  showsText={true}
                  color={weeklyMet ? '#27ae60' : '#e74c3c'}
                  formatText={() => `${Math.round(weeklyProgress * 100)}%`}
                />
              </View>
              <Text style={[
                styles.totalText,
                weeklyMet ? styles.metRequirement : styles.missedRequirement
              ]}>
                Week Total: {formatDuration(totalHours)} / 36h
              </Text>
            </View>
            
            <View style={styles.listContainer}>
              {weeklyData.length > 0 ? (
                weeklyData.map((item, index) => (
                  <View key={item.date} style={[styles.row, index === weeklyData.length - 1 && styles.rowLast]}>
                    <View style={styles.leftContainer}>
                      <Text style={styles.dayHeader}>{item.day.substring(0, 3)}</Text>
                      <Text style={styles.dateText}>{formatDateWithDay(item.date)}</Text>
                    </View>
                    <Text style={[
                      styles.hoursText,
                      item.met ? styles.metRequirement : styles.missedRequirement
                    ]}>
                      {formatDuration(item.total)} / {item.required}h
                    </Text>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={isDark ? '#444' : '#bdc3c7'} />
                  <Text style={styles.emptyStateText}>No data available for this week</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}