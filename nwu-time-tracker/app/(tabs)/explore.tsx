import React, { useState, useEffect } from "react";
import { View, Text, Dimensions, SafeAreaView, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import * as SQLite from "expo-sqlite";
import dayjs from "dayjs";

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
  const [weeklyData, setWeeklyData] = useState<
    { day: string; date: string; total: number; required: number; met: boolean }[]
  >([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(dayjs().startOf("week").add(1, "day"));
  const [grouped, setGrouped] = useState<{ [key: string]: number }>({});
  const [weeklyMet, setWeeklyMet] = useState(false);
  const [totalHours, setTotalHours] = useState(0);

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      try {
        const db = await SQLite.openDatabaseAsync("nwu_time_tracker.db");
        const rows = await db.getAllAsync("SELECT * FROM punches");
        
        if (isMounted) {
          const newGrouped: { [key: string]: number } = {};
          rows.forEach((p: any) => {
            newGrouped[p.date] = (newGrouped[p.date] || 0) + (p.duration || 0);
          });
          setGrouped(newGrouped);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };
    
    loadData();
    
    return () => {
      isMounted = false;
    };
  }, []);

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

  const handlePreviousWeek = () => {
    setCurrentWeekStart(currentWeekStart.subtract(7, "day"));
  };

  const handleNextWeek = () => {
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
      backgroundColor: "#f8f9fa",
    },
    content: {
      flex: 1,
      padding: isTablet ? 20 : 16,
    },
    header: {
      backgroundColor: '#2c3e50',
      padding: 20,
      borderRadius: 15,
      marginBottom: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: 'bold',
      color: 'white',
      textAlign: 'center',
    },
    weekTitle: {
      fontSize: 16,
      color: '#ecf0f1',
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
      backgroundColor: '#3498db',
      padding: 12,
      borderRadius: 10,
      flex: 1,
      minWidth: 120,
      alignItems: 'center',
    },
    navButtonText: {
      color: 'white',
      fontWeight: '600',
      fontSize: 14,
    },
    listContainer: {
      backgroundColor: 'white',
      borderRadius: 15,
      padding: 16,
      marginBottom: 16,
      flex: 1,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#ecf0f1',
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    leftText: {
      fontSize: 15,
      fontWeight: '500',
      color: '#2c3e50',
      flex: 1,
    },
    dayHeader: {
      fontSize: 13,
      fontWeight: 'bold',
      color: '#7f8c8d',
      marginBottom: 4,
    },
    rightText: {
      fontSize: 15,
      fontWeight: '500',
      textAlign: 'right',
      minWidth: 100,
    },
    totalContainer: {
      backgroundColor: 'white',
      padding: 16,
      borderRadius: 15,
      marginBottom: 16,
    },
    totalText: {
      fontSize: 18,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    metRequirement: {
      color: "#27ae60",
    },
    missedRequirement: {
      color: "#e74c3c",
    },
  });

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
          <TouchableOpacity style={styles.navButton} onPress={handlePreviousWeek}>
            <Text style={styles.navButtonText}>Previous Week</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={handleNextWeek}>
            <Text style={styles.navButtonText}>Next Week</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.listContainer}>
          {weeklyData.map((item, index) => (
            <View key={item.date} style={[styles.row, index === weeklyData.length - 1 && styles.rowLast]}>
              <View style={{flex: 1}}>
                <Text style={styles.dayHeader}>{item.day.substring(0, 3)}</Text>
                <Text style={styles.leftText}>{formatDateWithDay(item.date)}</Text>
              </View>
              <Text style={[
                styles.rightText,
                item.met ? styles.metRequirement : styles.missedRequirement
              ]}>
                {formatDuration(item.total)} / {item.required}h
              </Text>
            </View>
          ))}
        </View>
        
        <View style={styles.totalContainer}>
          <Text style={[
            styles.totalText,
            weeklyMet ? styles.metRequirement : styles.missedRequirement
          ]}>
            Week Total: {formatDuration(totalHours)} / 36h
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}