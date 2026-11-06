import { inject, Service } from '@angular/core';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
import { FirebaseError } from 'firebase/app';
import { FirebaseClient } from '../core/firebase-client';

export interface UploadedMedia {
  storagePath: string;
  downloadURL: string;
  contentType: string;
  size: number;
}

@Service()
export class MediaStorage {
  private readonly firebase = inject(FirebaseClient);
  private readonly maximumImageBytes = 10 * 1024 * 1024;
  private readonly maximumVideoBytes = 80 * 1024 * 1024;

  async uploadPostMedia(
    uid: string,
    postId: string,
    file: File,
    onProgress: (progress: number) => void,
  ): Promise<UploadedMedia> {
    const storage = this.firebase.storage;
    if (!storage) {
      throw new Error('Firebase Storage is not configured.');
    }
    this.validatePostMedia(file);

    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    };
    const extension = extensionByType[file.type];
    const storagePath = `post-media/${uid}/${postId}/${crypto.randomUUID()}.${extension}`;
    const uploadTask = uploadBytesResumable(ref(storage, storagePath), file, {
      contentType: file.type,
      customMetadata: { ownerUid: uid, postId },
    });

    try {
      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
          },
          reject,
          resolve,
        );
      });

      return {
        storagePath,
        downloadURL: await getDownloadURL(uploadTask.snapshot.ref),
        contentType: file.type,
        size: file.size,
      };
    } catch (reason) {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (cleanupError) {
        if (!(cleanupError instanceof FirebaseError && cleanupError.code === 'storage/object-not-found')) {
          throw new AggregateError([reason, cleanupError], 'Media upload failed and cleanup was unsuccessful.');
        }
      }
      throw reason;
    }
  }

  async resolvePublicUrl(storagePath: string): Promise<string> {
    const storage = this.firebase.storage;
    if (!storage) {
      throw new Error('Firebase Storage is not configured.');
    }
    return getDownloadURL(ref(storage, storagePath));
  }

  async deletePostMedia(storagePath: string): Promise<void> {
    const storage = this.firebase.storage;
    if (!storage) {
      throw new Error('Firebase Storage is not configured.');
    }
    await deleteObject(ref(storage, storagePath));
  }

  validatePostMedia(file: File): void {
    const imageAllowed = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    const videoAllowed = ['video/mp4', 'video/webm'].includes(file.type);

    if (!imageAllowed && !videoAllowed) {
      throw new Error('Choose a JPG, PNG, WebP, MP4, or WebM file.');
    }
    if (imageAllowed && file.size > this.maximumImageBytes) {
      throw new Error('Images must be 10 MB or smaller.');
    }
    if (videoAllowed && file.size > this.maximumVideoBytes) {
      throw new Error('Videos must be 80 MB or smaller.');
    }
  }
}
