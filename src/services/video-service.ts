import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export async function recordVideo(inspectionId: string, pointKey: string): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'videos',
    videoMaxDuration: 120,
    allowsMultipleSelection: false,
  });

  if (result.canceled || !result.assets[0]) return null;
  return saveVideo(result.assets[0].uri, inspectionId, pointKey);
}

function saveVideo(sourceUri: string, inspectionId: string, pointKey: string): string {
  const dirUri = Paths.document.uri + `inspections/${inspectionId}/`;
  new Directory(dirUri).create({ intermediates: true, idempotent: true });
  const ext = sourceUri.split('.').pop()?.toLowerCase() ?? 'mp4';
  const filename = `${pointKey.replace(/[^a-z0-9]/gi, '_')}_vid_${Date.now()}.${ext}`;
  const destFile = new File(dirUri + filename);
  if (destFile.exists) destFile.delete();
  new File(sourceUri).copy(destFile);
  return destFile.uri;
}
