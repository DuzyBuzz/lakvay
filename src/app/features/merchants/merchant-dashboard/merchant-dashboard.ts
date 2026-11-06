import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Auth } from '../../../core/auth';
import { FirebaseClient } from '../../../core/firebase-client';
import {
  BusinessListingDraft,
  DiscoveryData,
  PublicBusiness,
} from '../../../data-access/discovery-data';
import { MapCanvas } from '../../map/map-canvas/map-canvas';

@Component({
  imports: [MapCanvas, ReactiveFormsModule],
  selector: 'app-merchant-dashboard',
  styles: ``,
  templateUrl: './merchant-dashboard.html',
})
export class MerchantDashboard {
  private readonly auth = inject(Auth);
  private readonly firebase = inject(FirebaseClient);
  private readonly discovery = inject(DiscoveryData);
  readonly closed = output<void>();
  protected readonly listings = signal<PublicBusiness[]>([]);
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly selectedLocation = signal<readonly [number, number] | null>(null);
  protected readonly editingListingId = signal<string | null>(null);
  protected readonly latitude = computed(() => this.selectedLocation()?.[0].toFixed(6) ?? '');
  protected readonly longitude = computed(() => this.selectedLocation()?.[1].toFixed(6) ?? '');

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
    }),
    category: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(60)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(1000)],
    }),
    city: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    address: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(200)],
    }),
    website: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(300)],
    }),
  });

  constructor() {
    effect((onCleanup) => {
      const uid = this.auth.user()?.uid;
      if (!uid || !this.firebase.configured) {
        this.listings.set([]);
        this.loading.set(false);
        return;
      }

      this.loading.set(true);
      const stop = this.discovery.watchOwnedBusinesses(
        uid,
        (listings) => {
          this.listings.set(listings);
          this.loading.set(false);
        },
        (reason) => {
          this.error.set(reason.message);
          this.loading.set(false);
        },
      );
      onCleanup(stop);
    });
  }

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.form.markAllAsTouched();
    const user = this.auth.user();
    const values = this.form.getRawValue();
    const location = this.selectedLocation();
    if (!this.form.valid || !user || !location) {
      return;
    }

    const listing: BusinessListingDraft = {
      ...values,
      latitude: location[0],
      longitude: location[1],
    };

    this.submitting.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const editingId = this.editingListingId();
      if (editingId) {
        await this.discovery.updateBusinessListing(editingId, listing);
        this.notice.set('Listing updated and visible on the public map.');
      } else {
        await this.discovery.submitBusinessListing(user.uid, listing);
        this.notice.set('Listing published. It is now visible on the public map.');
      }
      this.resetForm();
    } catch (reason) {
      this.error.set(reason instanceof Error ? reason.message : 'Unable to submit this listing.');
    } finally {
      this.submitting.set(false);
    }
  }

  protected statusLabel(status: string): string {
    return status === 'published' ? 'Published on map' : 'Unavailable';
  }

  protected setSelectedLocation(location: readonly [number, number]): void {
    this.selectedLocation.set(location);
  }

  protected editListing(listing: PublicBusiness): void {
    this.editingListingId.set(listing.id);
    this.form.patchValue({
      name: listing.name,
      category: listing.category,
      description: listing.description,
      city: listing.city,
      address: listing.address,
      website: listing.website,
    });
    if (listing.latitude !== null && listing.longitude !== null) {
      this.selectedLocation.set([listing.latitude, listing.longitude]);
    }
    this.notice.set('');
    this.error.set('');
  }

  protected cancelEditing(): void {
    this.resetForm();
    this.notice.set('');
    this.error.set('');
  }

  private resetForm(): void {
    this.form.reset({
      name: '',
      category: '',
      description: '',
      city: '',
      address: '',
      website: '',
    });
    this.selectedLocation.set(null);
    this.editingListingId.set(null);
  }
}
