import { inject, Service } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { FirebaseClient } from '../core/firebase-client';
import { MediaStorage, UploadedMedia } from './media-storage';

export interface PublicBusiness {
  id: string;
  ownerUid: string;
  name: string;
  category: string;
  description: string;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  publicationStatus: string;
  coverImageUrl: string;
  coverImagePath: string;
  logoUrl: string;
  averageRating: number | null;
  reviewCount: number;
  verificationStatus: string;
  website: string;
}

export interface BusinessListingDraft {
  name: string;
  category: string;
  description: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  website: string;
}

export interface PublicPost {
  id: string;
  authorUid: string;
  authorDisplayName: string;
  authorPhotoURL: string;
  businessId: string;
  businessName: string;
  text: string;
  media: Array<{
    downloadURL: string;
    contentType: string;
    altText: string;
  }>;
  likeCount: number;
  commentCount: number;
}

@Service()
export class DiscoveryData {
  private readonly firebase = inject(FirebaseClient);
  private readonly mediaStorage = inject(MediaStorage);

  watchPublicBusinesses(
    next: (businesses: PublicBusiness[]) => void,
    error: (reason: Error) => void,
  ): () => void {
    const db = this.requireFirestore();
    const businessesQuery = query(
      collection(db, 'businesses'),
      where('publicationStatus', '==', 'published'),
    );

    return onSnapshot(
      businessesQuery,
      (snapshot) => {
        void this.mapBusinesses(snapshot.docs.map((item) => ({ ...item.data(), id: item.id })))
          .then(next)
          .catch((reason: unknown) => error(this.asError(reason)));
      },
      (reason) => error(this.asError(reason)),
    );
  }

  watchPublicPosts(
    next: (posts: PublicPost[]) => void,
    error: (reason: Error) => void,
  ): () => void {
    const db = this.requireFirestore();
    const postsQuery = query(
      collection(db, 'posts'),
      where('status', '==', 'published'),
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc'),
      limit(30),
    );

    return onSnapshot(
      postsQuery,
      (snapshot) => {
        void this.mapPosts(snapshot.docs.map((item) => ({ ...item.data(), id: item.id })))
          .then(next)
          .catch((reason: unknown) => error(this.asError(reason)));
      },
      (reason) => error(this.asError(reason)),
    );
  }

  watchSavedBusinesses(
    uid: string,
    next: (businessIds: string[]) => void,
    error: (reason: Error) => void,
  ): () => void {
    const db = this.requireFirestore();
    return onSnapshot(
      collection(db, 'users', uid, 'savedBusinesses'),
      (snapshot) => next(snapshot.docs.map((item) => item.id)),
      (reason) => error(this.asError(reason)),
    );
  }

  watchOwnedBusinesses(
    uid: string,
    next: (businesses: PublicBusiness[]) => void,
    error: (reason: Error) => void,
  ): () => void {
    const ownedBusinessesQuery = query(
      collection(this.requireFirestore(), 'businesses'),
      where('ownerUid', '==', uid),
      limit(30),
    );

    return onSnapshot(
      ownedBusinessesQuery,
      (snapshot) => {
        void this.mapBusinesses(snapshot.docs.map((item) => ({ ...item.data(), id: item.id })))
          .then(next)
          .catch((reason: unknown) => error(this.asError(reason)));
      },
      (reason) => error(this.asError(reason)),
    );
  }

  async submitBusinessListing(uid: string, listing: BusinessListingDraft): Promise<void> {
    const values = this.validateBusinessListing(listing);
    const businessRef = doc(collection(this.requireFirestore(), 'businesses'));
    await setDoc(businessRef, {
      ownerUid: uid,
      ...values,
      coverImageUrl: '',
      coverImagePath: '',
      logoUrl: '',
      averageRating: null,
      reviewCount: 0,
      verificationStatus: 'self-published',
      publicationStatus: 'published',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async updateBusinessListing(businessId: string, listing: BusinessListingDraft): Promise<void> {
    await setDoc(
      doc(this.requireFirestore(), 'businesses', businessId),
      {
        ...this.validateBusinessListing(listing),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async saveBusiness(uid: string, businessId: string): Promise<void> {
    const db = this.requireFirestore();
    await setDoc(doc(db, 'users', uid, 'savedBusinesses', businessId), {
      createdAt: serverTimestamp(),
    });
  }

  async unsaveBusiness(uid: string, businessId: string): Promise<void> {
    await deleteDoc(doc(this.requireFirestore(), 'users', uid, 'savedBusinesses', businessId));
  }

  async publishPost(
    uid: string,
    authorDisplayName: string,
    authorPhotoURL: string,
    text: string,
    file: File | null,
    onProgress: (progress: number) => void,
    business: PublicBusiness | null,
  ): Promise<void> {
    const cleanText = text.trim();
    if (!cleanText || cleanText.length > 300) {
      throw new Error('Your post must contain between 1 and 300 characters.');
    }

    const db = this.requireFirestore();
    const postRef = doc(collection(db, 'posts'));
    const uploadedMedia: UploadedMedia | null = file
      ? await this.mediaStorage.uploadPostMedia(uid, postRef.id, file, onProgress)
      : null;

    try {
      const media = uploadedMedia
        ? [
            {
              storagePath: uploadedMedia.storagePath,
              downloadURL: uploadedMedia.downloadURL,
              contentType: uploadedMedia.contentType,
              size: uploadedMedia.size,
              altText: '',
            },
          ]
        : [];
      await setDoc(postRef, {
        postId: postRef.id,
        authorUid: uid,
        authorDisplayName,
        authorPhotoURL,
        businessId: business?.id ?? '',
        businessName: business?.name ?? '',
        text: cleanText,
        media,
        visibility: 'public',
        status: 'published',
        likeCount: 0,
        commentCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (reason) {
      if (uploadedMedia) {
        try {
          await this.mediaStorage.deletePostMedia(uploadedMedia.storagePath);
        } catch (cleanupError) {
          throw new AggregateError(
            [reason, cleanupError],
            'The post could not be saved and its uploaded media could not be removed.',
          );
        }
      }
      throw reason;
    }
  }

  private requireFirestore() {
    if (!this.firebase.firestore) {
      throw new Error('Firebase is not configured. Add your Firebase web app settings first.');
    }
    return this.firebase.firestore;
  }

  private validateBusinessListing(listing: BusinessListingDraft): {
    name: string;
    category: string;
    description: string;
    city: string;
    address: string;
    latitude: number;
    longitude: number;
    website: string;
  } {
    const values = {
      name: listing.name.trim(),
      category: listing.category.trim(),
      description: listing.description.trim(),
      city: listing.city.trim(),
      address: listing.address.trim(),
      latitude: listing.latitude,
      longitude: listing.longitude,
      website: listing.website.trim(),
    };
    if (
      values.name.length < 2 ||
      values.name.length > 100 ||
      values.category.length < 2 ||
      values.category.length > 60 ||
      values.description.length > 1000 ||
      !values.city ||
      values.city.length > 80 ||
      values.address.length < 2 ||
      values.address.length > 200 ||
      values.website.length > 300 ||
      !Number.isFinite(values.latitude) ||
      values.latitude < -90 ||
      values.latitude > 90 ||
      !Number.isFinite(values.longitude) ||
      values.longitude < -180 ||
      values.longitude > 180
    ) {
      throw new Error('Check the business details and coordinates, then try again.');
    }
    return values;
  }

  private async mapBusinesses(records: Array<Record<string, unknown>>): Promise<PublicBusiness[]> {
    return Promise.all(
      records
        .filter((record) => typeof record['name'] === 'string')
        .map(async (record) => {
          const coverImagePath = this.string(record['coverImagePath']);
          const logoPath = this.string(record['logoPath']);
          const [coverImageUrl, logoUrl] = await Promise.all([
            this.resolveImage(this.string(record['coverImageUrl']), coverImagePath),
            this.resolveImage(this.string(record['logoUrl']), logoPath),
          ]);

          return {
            id: this.string(record['id']),
            ownerUid: this.string(record['ownerUid']),
            name: this.string(record['name']),
            category: this.string(record['category']) || this.string(record['categoryId']),
            description: this.string(record['description']),
            city: this.string(record['city']),
            address: this.string(record['address']),
            latitude: this.coordinate(record['latitude'], -90, 90),
            longitude: this.coordinate(record['longitude'], -180, 180),
            publicationStatus: this.string(record['publicationStatus']),
            coverImageUrl,
            coverImagePath,
            logoUrl,
            averageRating:
              typeof record['averageRating'] === 'number' ? record['averageRating'] : null,
            reviewCount: this.number(record['reviewCount']),
            verificationStatus: this.string(record['verificationStatus']),
            website: this.string(record['website']),
          };
        }),
    );
  }

  private async mapPosts(records: Array<Record<string, unknown>>): Promise<PublicPost[]> {
    return Promise.all(
      records
        .filter(
          (record) => typeof record['authorUid'] === 'string' && typeof record['text'] === 'string',
        )
        .map(async (record) => ({
          id: this.string(record['id']),
          authorUid: this.string(record['authorUid']),
          authorDisplayName: this.string(record['authorDisplayName']),
          authorPhotoURL: this.string(record['authorPhotoURL']),
          businessId: this.string(record['businessId']),
          businessName: this.string(record['businessName']),
          text: this.string(record['text']),
          media: await Promise.all(
            this.array(record['media']).map(async (item) => {
              const media = this.object(item);
              const path = this.string(media['storagePath']);
              return {
                downloadURL: await this.resolveImage(this.string(media['downloadURL']), path),
                contentType: this.string(media['contentType']),
                altText: this.string(media['altText']),
              };
            }),
          ),
          likeCount: this.number(record['likeCount']),
          commentCount: this.number(record['commentCount']),
        })),
    );
  }

  private async resolveImage(url: string, storagePath: string): Promise<string> {
    if (url) return url;
    if (!storagePath) return '';
    return this.mediaStorage.resolvePublicUrl(storagePath);
  }

  private string(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private number(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private coordinate(value: unknown, minimum: number, maximum: number): number | null {
    return typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= minimum &&
      value <= maximum
      ? value
      : null;
  }

  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  }

  private asError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error('Unable to load Lakvay content.');
  }
}
