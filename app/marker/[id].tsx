// app/marker/[id].tsx
import React from 'react';
import { StyleSheet, View, Text, Image, FlatList, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMarkers } from '../../context/DatabaseContext';

export default function MarkerDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  
  // Забираем безопасные функции БД вместо сырого setMarkers
  const { markers, deleteMarker, addImageToMarker, deleteImageFromMarker } = useMarkers();

  const marker = markers.find((m: any) => m.id === id);

  if (!marker) return <Text style={styles.centered}>Маркер не найден</Text>;

  // Выбор фото и сохранение его пути прямо в SQLite таблицу marker_images
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });

    if (!result.canceled && result.assets) {
      const newUri = result.assets[0].uri;
      // Сохраняем картинку в БД
      await addImageToMarker(marker.id, newUri);
    }
  };

  // Удаление маркера из базы данных SQLite
  const deleteThisMarker = () => {
    deleteMarker(marker.id); // Удаляем точку из БД
    router.back(); // Возвращаемся на карту
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{marker.title}</Text>
      
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.addBtn} onPress={pickImage}>
          <Text style={styles.btnText}>Добавить фото</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.delBtn} onPress={deleteThisMarker}>
          <Text style={styles.btnText}>Удалить маркер</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={marker.images}
        keyExtractor={(item) => item}
        numColumns={2}
        renderItem={({ item }) => (
          <View style={styles.imgWrapper}>
            <Image source={{ uri: item }} style={styles.img} />
            <TouchableOpacity 
              style={styles.delImgBtn} 
              onPress={() => deleteImageFromMarker(marker.id, item)}
            >
              <Text style={styles.delImgTxt}>Удалить</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  centered: { fontSize: 18, textAlign: 'center', marginTop: 50 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  addBtn: { backgroundColor: '#007aff', padding: 12, borderRadius: 8, width: '48%', alignItems: 'center' },
  delBtn: { backgroundColor: '#ff3b30', padding: 12, borderRadius: 8, width: '48%', alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold' },
  imgWrapper: { width: '48%', margin: '1%', borderRadius: 8, overflow: 'hidden', backgroundColor: '#f0f0f0' },
  img: { width: '100%', height: 120 },
  delImgBtn: { backgroundColor: '#ffe5e5', padding: 6, alignItems: 'center' },
  delImgTxt: { color: '#ff3b30', fontWeight: 'bold', fontSize: 12 },
});