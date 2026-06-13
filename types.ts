// types.ts
export interface MarkerData {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  images: string[]; // Просто массив ссылок на картинки в виде строк
}