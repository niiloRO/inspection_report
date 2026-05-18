import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

function inspectionPhotoDirUri(inspectionId: string): string {
  return Paths.document.uri + `inspections/${inspectionId}/`;
}

export async function takePhoto(
  inspectionId: string,
  pointKey: string,
): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.7,
    allowsMultipleSelection: false,
  });

  if (result.canceled || !result.assets[0]) return null;
  return savePhoto(result.assets[0].uri, inspectionId, pointKey);
}

export async function pickPhoto(
  inspectionId: string,
  pointKey: string,
): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    quality: 0.7,
    allowsMultipleSelection: false,
    mediaTypes: 'images',
  });

  if (result.canceled || !result.assets[0]) return null;
  return savePhoto(result.assets[0].uri, inspectionId, pointKey);
}

function savePhoto(sourceUri: string, inspectionId: string, pointKey: string): string {
  const dirUri = inspectionPhotoDirUri(inspectionId);
  new Directory(dirUri).create({ intermediates: true, idempotent: true });
  const filename = `${pointKey.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.jpg`;
  const destFile = new File(dirUri + filename);
  new File(sourceUri).copy(destFile);
  return destFile.uri;
}

export function deleteInspectionPhotos(inspectionId: string): void {
  const dir = new Directory(inspectionPhotoDirUri(inspectionId));
  if (dir.exists) {
    dir.delete();
  }
}

export async function photoToBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}
