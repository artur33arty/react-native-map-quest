// context/DatabaseContext.tsx
import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SQLite from 'expo-sqlite';
import { MarkerData } from '../types';

const DatabaseContext = createContext<any>(null);
let dbInstance: any = null;

const getDb = async () => {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('markers_db.db');
  }
  return dbInstance;
};

export const DatabaseProvider = ({ children }: any) => {
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 1. Инициализация БД
  const initDb = async () => {
    try {
      const db = await getDb();
      await db.execAsync(`
        PRAGMA foreign_keys = ON;
        
        CREATE TABLE IF NOT EXISTS markers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          title TEXT
        );

        CREATE TABLE IF NOT EXISTS marker_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          marker_id INTEGER NOT NULL,
          uri TEXT NOT NULL,
          FOREIGN KEY (marker_id) REFERENCES markers (id) ON DELETE CASCADE
        );
      `);
      await loadMarkers();
    } catch (err: any) {
      setError(err);
      setIsLoading(false);
    }
  };

  // 2. Чтение данных (Картинки теперь загружаются как простой массив строк)
  const loadMarkers = async () => {
    try {
      const db = await getDb();
      const markerRows: any[] = await db.getAllAsync('SELECT * FROM markers');
      const loadedMarkers: MarkerData[] = [];

      for (const m of markerRows) {
        const imageRows: any[] = await db.getAllAsync(
          'SELECT uri FROM marker_images WHERE marker_id = ?',
          m.id
        );
        
        loadedMarkers.push({
          id: m.id.toString(),
          latitude: m.latitude,
          longitude: m.longitude,
          title: m.title || `Точка #${m.id}`,
          images: imageRows.map((img) => img.uri), // Теперь это простой массив строк (ссылок)
        });
      }
      setMarkers(loadedMarkers);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initDb();
  }, []);

  // 3. Создание маркера
  const addMarker = async (latitude: number, longitude: number) => {
    try {
      const db = await getDb();
      const nextTitle = `Точка #${markers.length + 1}`;
      await db.runAsync(
        'INSERT INTO markers (latitude, longitude, title) VALUES (?, ?, ?)',
        latitude,
        longitude,
        nextTitle
      );
      await loadMarkers();
    } catch (err: any) {
      setError(err);
    }
  };

  // 4. Удаление маркера
  const deleteMarker = async (id: string) => {
    try {
      const db = await getDb();
      await db.runAsync('DELETE FROM markers WHERE id = ?', parseInt(id));
      await loadMarkers();
    } catch (err: any) {
      setError(err);
    }
  };

  // 5. Добавление картинки к маркеру
  const addImageToMarker = async (markerId: string, imageUri: string) => {
    try {
      const db = await getDb();
      await db.runAsync(
        'INSERT INTO marker_images (marker_id, uri) VALUES (?, ?)',
        parseInt(markerId),
        imageUri
      );
      await loadMarkers();
    } catch (err: any) {
      setError(err);
    }
  };

  // 6. Удаление картинки по её ссылке (URI)
  const deleteImageFromMarker = async (markerId: string, imageUri: string) => {
    try {
      const db = await getDb();
      await db.runAsync(
        'DELETE FROM marker_images WHERE marker_id = ? AND uri = ?',
        parseInt(markerId),
        imageUri
      );
      await loadMarkers();
    } catch (err: any) {
      setError(err);
    }
  };

  return (
    <DatabaseContext.Provider
      value={{
        markers,
        isLoading,
        error,
        addMarker,
        deleteMarker,
        addImageToMarker,
        deleteImageFromMarker,
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
};

export const useMarkers = () => useContext(DatabaseContext);