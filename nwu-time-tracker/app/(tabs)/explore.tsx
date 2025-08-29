import React, { useState, useEffect } from "react";
import { View, Text, FlatList, Button, Dimensions, SafeAreaView, StyleSheet } from "react-native";
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
  return `${hours} hr ${minutes} min`;
};

// Function to format date with day name
const formatDateWithDay = (dateString: string): string => {
  const date = dayjs(dateString);
  return `${date.format("DD-MM-YYYY")} | ${date.format("dddd")}`;
};

export default function WeeklyReport() {
  const [weeklyData, setWeeklyData] = useState<
    { day: string; date: string; total: number; required: number; met: boolean }[]
  >([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(dayjs().startOf("week").add(1, "day")); // Monday as state
  const [grouped, setGrouped] = useState<{ [key: string]: number }>({}); // Store grouped data once
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
  }, []); // Empty dependency array to run only once on mount

  useEffect(() => {
    // Generate days based on currentWeekStart
    const days = Array.from({ length: 6 }).map((_, i) => {
      const date = currentWeekStart.add(i, "day");
      const total = grouped[date.format("YYYY-MM-DD")] || 0;
      const required = i === 4 ? 4 : 5; // Friday → 4h, others → 5h
      return {
        day: date.format("dddd"),
        date: date.format("YYYY-MM-DD"),
        total,
        required,
        met: total >= required,
      };
    });
    
    setWeeklyData(days);
    
    // Calculate weekly totals
    const hours = days.reduce((acc, item) => acc + item.total, 0);
    setTotalHours(hours);
    setWeeklyMet(hours >= 36);
  }, [currentWeekStart, grouped]);

  const handlePreviousWeek = () => {
    setCurrentWeekStart(currentWeekStart.subtract(7, "day"));
  };

  const handleNextWeek = () => {
    const nextStart = currentWeekStart.add(7, "day");
    // Prevent navigating too far into future
    if (nextStart.isBefore(dayjs().add(1, "week"))) {
      setCurrentWeekStart(nextStart);
    }
  };

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
    weekTitle: {
      fontSize: isTablet ? 18 : 16,
      marginBottom: 10,
    },
    navContainer: {
      flexDirection: isTablet ? 'row' : 'column',
      justifyContent: isTablet ? 'space-around' : 'flex-start',
      marginBottom: 10,
    },
    navButtonSpacer: {
      marginVertical: isTablet ? 0 : 5,
      marginHorizontal: isTablet ? 10 : 0,
    },
    row: {
      padding: 10,
      borderBottomWidth: 1,
      borderColor: "#ccc",
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    leftText: {
      fontSize: isTablet ? 16 : 14,
      flex: 1,
      marginRight: 10,
    },
    rightText: {
      fontSize: isTablet ? 16 : 14,
      textAlign: 'right',
    },
    totalContainer: {
      marginTop: 20,
      padding: 10,
      borderTopWidth: 1,
      borderColor: "#ccc",
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    totalText: {
      fontWeight: "bold",
      fontSize: isTablet ? 18 : 16,
    },
    metRequirement: {
      color: "green",
      fontWeight: "bold",
    },
    missedRequirement: {
      color: "red",
      fontWeight: "bold",
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Weekly Report</Text>
        <Text style={styles.weekTitle}>
          Week: {currentWeekStart.format("MMM D")} - {currentWeekStart.add(5, 'day').format("MMM D")}
        </Text>
        
        <View style={styles.navContainer}>
          <Button title="Previous Week" onPress={handlePreviousWeek} />
          <View style={styles.navButtonSpacer} />
          <Button title="Next Week" onPress={handleNextWeek} />
        </View>
        
        <FlatList
          data={weeklyData}
          keyExtractor={(item) => item.date}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.leftText}>
                {formatDateWithDay(item.date)}
              </Text>
              <Text style={[
                styles.rightText,
                item.met ? styles.metRequirement : styles.missedRequirement
              ]}>
                {formatDuration(item.total)} / {formatDuration(item.required)}
              </Text>
            </View>
          )}
        />
        
        <View style={styles.totalContainer}>
          <Text style={[
            styles.totalText,
            weeklyMet ? styles.metRequirement : styles.missedRequirement
          ]}>
            Week Total: {formatDuration(totalHours)} / 36 hours
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}