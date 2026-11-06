import { Service } from '@angular/core';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import { environment } from '../../environments/environment';

@Service()
export class FirebaseClient {
  readonly configured = Object.values(environment.firebase).every(
    (value) => value.length > 0 && !value.startsWith('REPLACE_WITH_'),
  );

  readonly app: FirebaseApp | null = this.configured
    ? getApps().length > 0
      ? getApp()
      : initializeApp(environment.firebase)
    : null;

  readonly auth: Auth | null = this.app ? getAuth(this.app) : null;
  readonly firestore: Firestore | null = this.app ? getFirestore(this.app) : null;
  readonly storage: FirebaseStorage | null = this.app ? getStorage(this.app) : null;
}
