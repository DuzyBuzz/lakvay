import { inject, Service } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { FirebaseClient } from '../core/firebase-client';
import { PublicBusiness, PublicPost } from './discovery-data';

export interface Conversation {
  id: string;
  businessId: string;
  businessName: string;
  participantUids: string[];
  lastMessage: string;
  updatedAt: unknown;
}

export interface ChatMessage {
  id: string;
  senderUid: string;
  text: string;
  createdAt: unknown;
}

export interface Review {
  id: string;
  authorUid: string;
  authorName: string;
  rating: number;
  text: string;
  createdAt: unknown;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: unknown;
}

@Service()
export class CommunityData {
  private readonly firebase = inject(FirebaseClient);

  watchConversations(
    uid: string,
    next: (conversations: Conversation[]) => void,
    error: (reason: Error) => void,
  ): () => void {
    const conversationsQuery = query(
      collection(this.requireFirestore(), 'conversations'),
      where('participantUids', 'array-contains', uid),
      limit(50),
    );
    return onSnapshot(
      conversationsQuery,
      (snapshot) => {
        const conversations = snapshot.docs
          .map((item) => this.mapConversation(item.id, item.data()))
          .sort(
            (left, right) =>
              this.timestampValue(right.updatedAt) - this.timestampValue(left.updatedAt),
          );
        next(conversations);
      },
      (reason) => error(this.asError(reason)),
    );
  }

  watchMessages(
    conversationId: string,
    next: (messages: ChatMessage[]) => void,
    error: (reason: Error) => void,
  ): () => void {
    return onSnapshot(
      query(
        collection(this.requireFirestore(), 'conversations', conversationId, 'messages'),
        limit(100),
      ),
      (snapshot) => {
        const messages = snapshot.docs
          .map((item) => this.mapMessage(item.id, item.data()))
          .sort(
            (left, right) =>
              this.timestampValue(left.createdAt) - this.timestampValue(right.createdAt),
          );
        next(messages);
      },
      (reason) => error(this.asError(reason)),
    );
  }

  async startConversation(uid: string, business: PublicBusiness): Promise<string> {
    if (!business.ownerUid || business.ownerUid === uid) {
      throw new Error('You cannot message your own business listing.');
    }
    const id = [uid, business.ownerUid].sort().join('_');
    await setDoc(
      doc(this.requireFirestore(), 'conversations', id),
      {
        businessId: business.id,
        businessName: business.name,
        participantUids: [uid, business.ownerUid],
        lastMessage: '',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return id;
  }

  async sendMessage(uid: string, conversationId: string, text: string): Promise<void> {
    const cleanText = text.trim();
    if (!cleanText || cleanText.length > 1000) {
      throw new Error('Message must contain between 1 and 1000 characters.');
    }
    const db = this.requireFirestore();
    await setDoc(doc(collection(db, 'conversations', conversationId, 'messages')), {
      senderUid: uid,
      text: cleanText,
      createdAt: serverTimestamp(),
    });
    await setDoc(
      doc(db, 'conversations', conversationId),
      { lastMessage: cleanText, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }

  watchNotifications(
    uid: string,
    next: (notifications: NotificationItem[]) => void,
    error: (reason: Error) => void,
  ): () => void {
    return onSnapshot(
      query(collection(this.requireFirestore(), 'users', uid, 'notifications'), limit(50)),
      (snapshot) => {
        next(
          snapshot.docs
            .map((item) => this.mapNotification(item.id, item.data()))
            .sort(
              (left, right) =>
                this.timestampValue(right.createdAt) - this.timestampValue(left.createdAt),
            ),
        );
      },
      (reason) => error(this.asError(reason)),
    );
  }

  async markNotificationRead(uid: string, notificationId: string): Promise<void> {
    await setDoc(
      doc(this.requireFirestore(), 'users', uid, 'notifications', notificationId),
      { read: true },
      { merge: true },
    );
  }

  watchReviews(
    businessId: string,
    next: (reviews: Review[]) => void,
    error: (reason: Error) => void,
  ): () => void {
    return onSnapshot(
      query(collection(this.requireFirestore(), 'businesses', businessId, 'reviews'), limit(100)),
      (snapshot) => next(snapshot.docs.map((item) => this.mapReview(item.id, item.data()))),
      (reason) => error(this.asError(reason)),
    );
  }

  async saveReview(
    uid: string,
    authorName: string,
    businessId: string,
    rating: number,
    text: string,
  ): Promise<void> {
    const cleanText = text.trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || cleanText.length > 1000) {
      throw new Error('Choose a rating from 1 to 5 and keep your review under 1000 characters.');
    }
    await setDoc(doc(this.requireFirestore(), 'businesses', businessId, 'reviews', uid), {
      authorUid: uid,
      authorName: authorName.slice(0, 80),
      rating,
      text: cleanText,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async togglePostLike(uid: string, post: PublicPost, liked: boolean): Promise<void> {
    const likeRef = doc(this.requireFirestore(), 'posts', post.id, 'likes', uid);
    if (liked) {
      await deleteDoc(likeRef);
      return;
    }
    await setDoc(likeRef, { uid, createdAt: serverTimestamp() });
  }

  watchPostLikes(
    postId: string,
    uid: string,
    next: (state: { count: number; liked: boolean }) => void,
    error: (reason: Error) => void,
  ): () => void {
    return onSnapshot(
      collection(this.requireFirestore(), 'posts', postId, 'likes'),
      (snapshot) =>
        next({ count: snapshot.size, liked: snapshot.docs.some((item) => item.id === uid) }),
      (reason) => error(this.asError(reason)),
    );
  }

  async addPostComment(
    uid: string,
    postId: string,
    authorName: string,
    text: string,
  ): Promise<void> {
    const cleanText = text.trim();
    if (!cleanText || cleanText.length > 500) {
      throw new Error('Comment must contain between 1 and 500 characters.');
    }
    await setDoc(doc(collection(this.requireFirestore(), 'posts', postId, 'comments')), {
      authorUid: uid,
      authorName: authorName.slice(0, 80),
      text: cleanText,
      createdAt: serverTimestamp(),
    });
  }

  private requireFirestore() {
    if (!this.firebase.firestore) {
      throw new Error('Firebase is not configured. Add your Firebase web app settings first.');
    }
    return this.firebase.firestore;
  }

  private mapConversation(id: string, data: Record<string, unknown>): Conversation {
    return {
      id,
      businessId: this.string(data['businessId']),
      businessName: this.string(data['businessName']),
      participantUids: Array.isArray(data['participantUids'])
        ? data['participantUids'].filter((item): item is string => typeof item === 'string')
        : [],
      lastMessage: this.string(data['lastMessage']),
      updatedAt: data['updatedAt'],
    };
  }

  private mapMessage(id: string, data: Record<string, unknown>): ChatMessage {
    return {
      id,
      senderUid: this.string(data['senderUid']),
      text: this.string(data['text']),
      createdAt: data['createdAt'],
    };
  }

  private mapReview(id: string, data: Record<string, unknown>): Review {
    return {
      id,
      authorUid: this.string(data['authorUid']),
      authorName: this.string(data['authorName']),
      rating: typeof data['rating'] === 'number' ? data['rating'] : 0,
      text: this.string(data['text']),
      createdAt: data['createdAt'],
    };
  }

  private mapNotification(id: string, data: Record<string, unknown>): NotificationItem {
    return {
      id,
      title: this.string(data['title']),
      body: this.string(data['body']),
      read: data['read'] === true,
      createdAt: data['createdAt'],
    };
  }

  private timestampValue(value: unknown): number {
    if (
      value &&
      typeof value === 'object' &&
      'toMillis' in value &&
      typeof value.toMillis === 'function'
    ) {
      return value.toMillis();
    }
    return 0;
  }

  private string(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private asError(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error('Unable to load community data.');
  }
}
