// app/index.tsx
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Alert, Text, TouchableOpacity } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useMarkers } from '../context/DatabaseContext';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
     shouldShowBanner: true,
     shouldShowList: true,
  }),
});

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function MapScreen() {
  const router = useRouter();
  const { markers, addMarker, deleteMarker } = useMarkers(); // Забираем функцию удаления из БД
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [simulatedCoords, setSimulatedCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  
  const notifiedMarkers = useRef<Set<string>>(new Set());
  const simInterval = useRef<any>(null);
  const simCoordsRef = useRef({ latitude: 0, longitude: 0 }); 
  
  const mapRef = useRef<MapView>(null); 
  const hasCentered = useRef(false);   

  // Важнейший реф, который всегда хранит самый актуальный список точек из БД
  const markersRef = useRef(markers);
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  // GPS-трекинг реального местоположения
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const setupServices = async () => {
      try {
        // 1. Спрашиваем у телефона разрешение на использование GPS
        const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
        if (locStatus !== 'granted') {
          setErrorMsg('Доступ к геолокации отклонен');
          return;
        }
        // 2. Спрашиваем разрешение на отправку пуш-уведомлений
        const { status: notifStatus } = await Notifications.requestPermissionsAsync();
        if (notifStatus !== 'granted') {
          Alert.alert('Внимание', 'Приложение не сможет отправлять уведомления.');
        }
        // 3. Подписываемся на реальные координаты телефона
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 4000,
            distanceInterval: 5,
          },
          (location) => {
            const { latitude, longitude } = location.coords;
            
            // Автоперелет в Пермь при запуске
            if (!hasCentered.current) {
              hasCentered.current = true;
              mapRef.current?.animateToRegion({
                latitude,
                longitude,
                latitudeDelta: 0.03,
                longitudeDelta: 0.03,
              }, 1500); 
            }

            if (!isSimulating) {
              checkProximity(latitude, longitude);
            }
          }
        );
      } catch (err: any) {
        setErrorMsg('Ошибка настройки служб GPS');
      }
    };

    setupServices();

    return () => {
      if (subscription) subscription.remove();
    };
  }, [markers]);

  useEffect(() => {
    return () => {
      if (simInterval.current) clearInterval(simInterval.current);
    };
  }, []);

  // Проверка приближения к маркерам
  const checkProximity = async (userLat: number, userLon: number) => {
    const PROXIMITY_THRESHOLD = 100; // 100 метров

    markersRef.current.forEach(async (marker: any) => {
      const distance = calculateDistance(userLat, userLon, marker.latitude, marker.longitude);

      if (distance <= PROXIMITY_THRESHOLD) {
        if (!notifiedMarkers.current.has(marker.id)) {
          notifiedMarkers.current.add(marker.id);
          
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Вы рядом с сохраненной точкой!',
              body: `Вы приблизились к "${marker.title}" на расстояние ${Math.round(distance)}м.`,
            },
            trigger: null,
          });
        }
      } else {
        if (notifiedMarkers.current.has(marker.id)) {
          notifiedMarkers.current.delete(marker.id);
        }
      }
    });
  };

  // ЗАПУСК РЕЖИМА С УДАЛЕНИЕМ ТОЧЕК
  const startSimulation = () => {
    const freshMarkers = markersRef.current;

    if (freshMarkers.length === 0) {
      Alert.alert('Нет точек', 'Пожалуйста, создайте на карте несколько точек долгим нажатием.');
      return;
    }

    const firstTarget = freshMarkers[0]; // Всегда идем к самому первому маркеру в списке
    
    // Ставим синего человечка чуть поодаль от первой точки
    let curLat = firstTarget.latitude - 0.0025;
    let curLon = firstTarget.longitude - 0.0025;
    
    simCoordsRef.current = { latitude: curLat, longitude: curLon };
    setSimulatedCoords(simCoordsRef.current);
    setIsSimulating(true);
    notifiedMarkers.current.clear(); // Сбрасываем кэш уведомлений

    // Запускаем таймер ходьбы
    simInterval.current = setInterval(async () => {
      const { latitude, longitude } = simCoordsRef.current;
      const currentMarkers = markersRef.current;

      // Если в базе данных не осталось точек — завершаем симуляцию
      if (currentMarkers.length === 0) {
        clearInterval(simInterval.current);
        setIsSimulating(false);
        setSimulatedCoords(null);
        Alert.alert('Маршрут пройден!', 'Вы успешно посетили и удалили все сохраненные точки!');
        return;
      }

      const currentTarget = currentMarkers[0]; // Цель — всегда первая оставшаяся точка на карте

      const latDiff = currentTarget.latitude - latitude;
      const lonDiff = currentTarget.longitude - longitude;
      const dist = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);

      const step = 0.0003; // Размер шага (примерно 30 метров)

      if (dist < step) {
        // МЫ ДОСТИГЛИ ТОЧКИ!
        checkProximity(currentTarget.latitude, currentTarget.longitude);

        // Показываем уведомление о взятии точки и удаляем её из базы данных SQLite!
        Alert.alert('Цель достигнута!', `Вы успешно посетили точку "${currentTarget.title}".`);
        await deleteMarker(currentTarget.id); // УДАЛЯЕМ ИЗ БД (карта перерисуется сама)

      } else {
        // Делаем шаг к цели
        const nextLat = latitude + (latDiff / dist) * step;
        const nextLon = longitude + (lonDiff / dist) * step;
        
        simCoordsRef.current = { latitude: nextLat, longitude: nextLon };
        setSimulatedCoords({ latitude: nextLat, longitude: nextLon });
        checkProximity(nextLat, nextLon); 

        // Камера следует за синей точкой
        mapRef.current?.animateToRegion({
          latitude: nextLat,
          longitude: nextLon,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 800);
      }
    }, 1200); 
  };

  const stopSimulation = () => {
    if (simInterval.current) {
      clearInterval(simInterval.current);
    }
    setIsSimulating(false);
    setSimulatedCoords(null);
  };

  const handleLongPress = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    Alert.alert(
      'Добавить маркер',
      `Создать новую точку в этих координатах?\n\nШирота: ${latitude.toFixed(5)}\nДолгота: ${longitude.toFixed(5)}`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Создать',
          onPress: () => {
            addMarker(latitude, longitude);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation={!isSimulating}
        followsUserLocation={false}
        initialRegion={{
          latitude: 55.7558,
          longitude: 37.6173,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        onLongPress={handleLongPress}
      >
        {isSimulating && simulatedCoords && (
          <Marker
            coordinate={simulatedCoords}
            title="Вы (Движение к цели)"
            pinColor="blue"
          />
        )}

        {markers.map((marker: any) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={marker.title}
            description="Нажмите, чтобы открыть детали"
            onCalloutPress={() => {
              router.push(`/marker/${marker.id}`);
            }}
          />
        ))}
      </MapView>

      <TouchableOpacity 
        style={[styles.simBtn, isSimulating ? styles.simBtnStop : styles.simBtnStart]} 
        onPress={isSimulating ? stopSimulation : startSimulation}
      >
        <Text style={styles.simBtnText}>
          {isSimulating ? '■ Остановить тест' : '▶ Запустить тест GPS'}
        </Text>
      </TouchableOpacity>
      
      {errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  simBtn: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  simBtnStart: { backgroundColor: '#4cd964' },
  simBtnStop: { backgroundColor: '#ff3b30' },
  simBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  errorBanner: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 59, 48, 0.9)',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
});