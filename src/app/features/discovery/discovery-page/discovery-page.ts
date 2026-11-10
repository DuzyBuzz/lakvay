import { DatePipe, NgOptimizedImage } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { Auth } from '../../../core/auth';
import { FirebaseClient } from '../../../core/firebase-client';
import { DEMO_BUSINESSES, DEMO_POSTS } from '../../../data-access/demo-businesses';
import { DiscoveryData, PublicBusiness, PublicPost } from '../../../data-access/discovery-data';
import { MediaStorage } from '../../../data-access/media-storage';
import {
  ChatMessage,
  CommunityData,
  Conversation,
  NotificationItem,
} from '../../../data-access/community-data';
import { AuthDialog } from '../../auth/auth-dialog/auth-dialog';
import { MapCanvas } from '../../map/map-canvas/map-canvas';
import { DirectionsMap } from '../../map/directions-map/directions-map';
import { MerchantDashboard } from '../../merchants/merchant-dashboard/merchant-dashboard';
import { ConsumerOnboarding } from '../../onboarding/consumer-onboarding/consumer-onboarding';

type WorkspaceView = 'home' | 'map' | 'chats' | 'saved' | 'profile';
type DialogView = 'share' | 'merchants' | 'auth' | 'onboarding' | 'business-dashboard' | null;

@Component({
  imports: [MapCanvas, DirectionsMap, DatePipe, NgOptimizedImage, AuthDialog, ConsumerOnboarding, MerchantDashboard],
  selector: 'app-discovery-page',
  styles: ``,
  templateUrl: './discovery-page.html',
})
export class DiscoveryPage {
  protected readonly auth = inject(Auth);
  private readonly firebase = inject(FirebaseClient);
  private readonly discovery = inject(DiscoveryData);
  private readonly mediaStorage = inject(MediaStorage);
  private readonly community = inject(CommunityData);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly activeView = signal<WorkspaceView>('home');
  protected readonly activeDialog = signal<DialogView>(null);
  protected readonly merchantAuthPending = signal(false);
  protected readonly profileAuthPending = signal(false);
  protected readonly activeCategory = signal('All');
  protected readonly searchTerm = signal('');
  protected readonly postText = signal('');
  protected readonly isPublishing = signal(false);
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly mediaPreviewUrl = signal('');
  protected readonly uploadProgress = signal<number | null>(null);
  protected readonly selectedBusiness = signal<PublicBusiness | null>(null);
  protected readonly directionsOpen = signal(false);
  protected readonly selectedPostBusiness = signal<PublicBusiness | null>(null);
  protected readonly savedBusinesses = signal<string[]>([]);
  protected readonly savingBusinessIds = signal<string[]>([]);
  protected readonly posts = signal<PublicPost[]>([]);
  protected readonly businesses = signal<PublicBusiness[]>([]);
  protected readonly businessesLoading = signal(true);
  protected readonly demoBusinessesActive = signal(false);
  protected readonly postsLoading = signal(true);
  protected readonly firebaseConfigured = this.firebase.configured;
  protected readonly backendError = signal('');
  protected readonly toast = signal('');
  protected readonly mobileMenuOpen = signal(false);
  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly selectedConversation = signal<Conversation | null>(null);
  protected readonly chatMessages = signal<ChatMessage[]>([]);
  protected readonly chatText = signal('');
  protected readonly chatFilter = signal<'all' | 'unread'>('all');
  protected readonly openChatIds = signal<string[]>([]);
  protected readonly notifications = signal<NotificationItem[]>([]);
  protected readonly notificationsOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);
  protected readonly locationLabel = signal('Iloilo City');
  protected readonly locating = signal(false);
  protected readonly profileName = signal('');
  protected readonly profileSaving = signal(false);
  protected readonly darkTheme = signal(false);
  protected readonly likedPostIds = signal<string[]>([]);
  protected readonly commentPostId = signal<string | null>(null);
  protected readonly commentText = signal('');
  protected readonly signedInUser = this.auth.user;
  protected readonly staticNotifications: NotificationItem[] = [
    {
      id: 'static-welcome',
      title: 'Welcome to Lakvay',
      body: 'Discover local places, save favorites, and share your Iloilo food finds.',
      read: false,
      createdAt: null,
    },
    {
      id: 'static-explore',
      title: 'New places to explore',
      body: 'Fresh curated spots are waiting in Explore Iloilo.',
      read: false,
      createdAt: null,
    },
    {
      id: 'static-profile',
      title: 'Complete your Lakvay profile',
      body: 'Answer the food personality questions to get better recommendations.',
      read: false,
      createdAt: null,
    },
  ];

  protected readonly categories = computed(() => [
    'All',
    ...new Set(
      this.businesses()
        .map((business) => business.category)
        .filter(Boolean),
    ),
  ]);

  protected readonly filteredBusinesses = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const category = this.activeCategory();

    return this.businesses().filter((business) => {
      const matchesCategory = category === 'All' || business.category === category;
      const matchesSearch =
        !query ||
        `${business.name} ${business.category} ${business.description} ${business.city} ${business.address}`
          .toLowerCase()
          .includes(query);

      return matchesCategory && matchesSearch;
    });
  });
  protected readonly mappableBusinesses = computed(() =>
    this.filteredBusinesses().filter(
      (business) =>
        business.latitude !== null &&
        business.longitude !== null &&
        Number.isFinite(business.latitude) &&
        Number.isFinite(business.longitude),
    ),
  );
  protected readonly businessesWithoutLocation = computed(
    () => this.filteredBusinesses().length - this.mappableBusinesses().length,
  );
  protected readonly realBusinesses = computed(() =>
    this.businesses().filter((business) => business.verificationStatus !== 'demo'),
  );

  protected readonly featuredBusiness = computed(() => this.businesses()[0] ?? null);
  protected readonly profilePosts = computed(() => {
    const businessId = this.selectedBusiness()?.id;
    return businessId ? this.posts().filter((post) => post.businessId === businessId) : [];
  });
  protected readonly savedBusinessList = computed(() => {
    const savedIds = new Set(this.savedBusinesses());
    return this.businesses().filter((business) => savedIds.has(business.id));
  });

  protected readonly collections = [
    {
      title: 'Date Night Favorites',
      category: 'Casual dining',
      image:
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=480&q=80',
      tint: 'bg-[#f0e9e6]',
    },
    {
      title: 'Local Favorites',
      category: 'Markets & shops',
      image:
        'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=480&q=80',
      tint: 'bg-[#fff0c6]',
    },
    {
      title: 'Student Budget Meals',
      category: 'Restaurants',
      image:
        'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=480&q=80',
      tint: 'bg-[#eeebe8]',
    },
    {
      title: 'Sunset Eats',
      category: 'Bars & Pubs',
      image:
        'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?auto=format&fit=crop&w=480&q=80',
      tint: 'bg-[#f3e9df]',
    },
    {
      title: 'Bar Hopping',
      category: 'Bars & Pubs',
      image:
        'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=480&q=80',
      tint: 'bg-[#f0e9e6]',
    },
  ];

  private toastTimeout: number | undefined;

  constructor() {
    let stopBusinesses = () => {};
    let stopPosts = () => {};
    this.setBusinesses(DEMO_BUSINESSES);
    this.posts.set(DEMO_POSTS);
    this.businessesLoading.set(false);
    if (this.firebaseConfigured) {
      stopBusinesses = this.discovery.watchPublicBusinesses(
        () => {},
        () => {},
      );
      stopPosts = this.discovery.watchPublicPosts(
        (posts) => {
          this.posts.set([...DEMO_POSTS, ...posts]);
          this.postsLoading.set(false);
        },
        (error) => {
          this.posts.set(DEMO_POSTS);
          this.postsLoading.set(false);
        },
      );
    } else {
      this.postsLoading.set(false);
    }
    this.destroyRef.onDestroy(() => {
      stopBusinesses();
      stopPosts();
      if (this.toastTimeout !== undefined) window.clearTimeout(this.toastTimeout);
      this.clearSelectedFile();
    });

    effect((onCleanup) => {
      const uid = this.signedInUser()?.uid;
      if (!uid || !this.firebaseConfigured) {
        this.savedBusinesses.set([]);
        return;
      }
      const stopSavedBusinesses = this.discovery.watchSavedBusinesses(
        uid,
        (businessIds) => this.savedBusinesses.set(businessIds),
        (error) =>
          this.backendError.set(this.backendErrorMessage(error, 'Unable to load saved places.')),
      );
      onCleanup(stopSavedBusinesses);
    });

    effect((onCleanup) => {
      const uid = this.signedInUser()?.uid;
      if (!uid || !this.firebaseConfigured) {
        this.conversations.set([]);
        this.notifications.set(this.staticNotifications);
        return;
      }
      const stopConversations = this.community.watchConversations(
        uid,
        (conversations) => this.conversations.set(conversations),
        (error) => this.backendError.set(error.message),
      );
      const stopNotifications = this.community.watchNotifications(
        uid,
        (notifications) =>
          this.notifications.set([...this.staticNotifications, ...notifications]),
        (error) => this.backendError.set(error.message),
      );
      onCleanup(() => {
        stopConversations();
        stopNotifications();
      });
    });

    effect((onCleanup) => {
      const conversation = this.selectedConversation();
      if (!conversation || !this.firebaseConfigured) {
        this.chatMessages.set([]);
        return;
      }
      const stop = this.community.watchMessages(
        conversation.id,
        (messages) => this.chatMessages.set(messages),
        (error) => this.backendError.set(error.message),
      );
      onCleanup(stop);
    });

    this.darkTheme.set(localStorage.getItem('lakvay-theme') === 'dark');
    afterNextRender(() => this.detectCurrentLocation());
  }

  private detectCurrentLocation(): void {
    if (!navigator.geolocation) return;
    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`,
            { headers: { Accept: 'application/json' } },
          );
          if (!response.ok) throw new Error('Location lookup failed');
          const data = (await response.json()) as {
            address?: { city?: string; town?: string; municipality?: string; state?: string };
          };
          const address = data.address;
          this.locationLabel.set(
            [address?.city || address?.town || address?.municipality, address?.state]
              .filter(Boolean)
              .join(', ') || 'Current location',
          );
        } catch {
          this.locationLabel.set('Current location');
        } finally {
          this.locating.set(false);
        }
      },
      () => {
        this.locationLabel.set('Iloilo City');
        this.locating.set(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  protected navigate(view: WorkspaceView): void {
    this.activeView.set(view);
    this.mobileMenuOpen.set(false);
  }

  protected toggleTheme(): void {
    this.darkTheme.update((dark) => !dark);
    localStorage.setItem('lakvay-theme', this.darkTheme() ? 'dark' : 'light');
  }

  protected setLightTheme(): void {
    this.darkTheme.set(false);
    localStorage.setItem('lakvay-theme', 'light');
  }

  protected openHelp(): void {
    this.showToast(
      'Help: search places, open a profile after signing in, or use For Business to publish a listing.',
    );
  }

  protected openSettings(): void {
    if (!this.signedInUser()) {
      this.openAuthDialog();
      return;
    }
    this.profileName.set(this.signedInUser()?.displayName ?? '');
    this.showToast('Edit your profile from the Profile tab.');
    this.navigate('profile');
  }

  protected async openConversation(business: PublicBusiness): Promise<void> {
    const user = this.signedInUser();
    if (!user) {
      this.openAuthDialog();
      return;
    }
    try {
      const id = await this.community.startConversation(user.uid, business);
      this.selectedConversation.set({
        id,
        businessId: business.id,
        businessName: business.name,
        participantUids: [user.uid, business.ownerUid],
        lastMessage: '',
        updatedAt: null,
      });
      this.openChatIds.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
      this.navigate('chats');
    } catch (error) {
      this.backendError.set(this.backendErrorMessage(error, 'Unable to start a conversation.'));
    }
  }

  protected selectConversation(conversation: Conversation): void {
    this.selectedConversation.set(conversation);
    this.openChatIds.update((ids) =>
      ids.includes(conversation.id) ? ids : [...ids, conversation.id],
    );
  }

  protected filteredConversations(): Conversation[] {
    if (this.chatFilter() === 'unread') {
      return this.conversations().filter((conversation) => conversation.lastMessage === '');
    }
    return this.conversations();
  }

  protected selectChatTab(conversationId: string): void {
    const conversation = this.conversations().find((item) => item.id === conversationId);
    if (conversation) this.selectConversation(conversation);
  }

  protected closeChatTab(conversationId: string, event: MouseEvent): void {
    event.stopPropagation();
    const remaining = this.openChatIds().filter((id) => id !== conversationId);
    this.openChatIds.set(remaining);
    if (this.selectedConversation()?.id === conversationId) {
      const nextId = remaining.at(-1);
      this.selectedConversation.set(
        nextId ? this.conversations().find((conversation) => conversation.id === nextId) ?? null : null,
      );
    }
  }

  protected updateChatText(event: Event): void {
    if (event.target instanceof HTMLTextAreaElement) this.chatText.set(event.target.value);
  }

  protected async sendChatMessage(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const user = this.signedInUser();
    const conversation = this.selectedConversation();
    if (!user || !conversation || !this.chatText().trim()) return;
    try {
      await this.community.sendMessage(user.uid, conversation.id, this.chatText());
      this.chatText.set('');
    } catch (error) {
      this.backendError.set(this.backendErrorMessage(error, 'Unable to send your message.'));
    }
  }

  protected async markNotificationsRead(): Promise<void> {
    const user = this.signedInUser();
    if (!user) {
      this.notifications.update((items) => items.map((item) => ({ ...item, read: true })));
      this.notificationsOpen.set(false);
      return;
    }
    await Promise.all(
      this.notifications()
        .filter((notification) => !notification.read)
        .filter((notification) => !notification.id.startsWith('static-'))
        .map((notification) => this.community.markNotificationRead(user.uid, notification.id)),
    );
    this.notifications.update((items) => items.map((item) => ({ ...item, read: true })));
    this.notificationsOpen.set(false);
  }

  protected async becomeMerchant(): Promise<void> {
    try {
      await this.auth.becomeMerchant();
      this.showToast('Merchant mode is ready. Add your first place to Lakvay.');
    } catch (error) {
      this.backendError.set(this.backendErrorMessage(error, 'Unable to enable merchant mode.'));
    }
  }

  protected updateProfileName(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.profileName.set(event.target.value);
  }

  protected async saveProfile(): Promise<void> {
    if (this.profileSaving()) return;
    this.profileSaving.set(true);
    try {
      await this.auth.updateDisplayName(this.profileName());
      this.showToast('Profile updated.');
    } catch (error) {
      this.backendError.set(this.backendErrorMessage(error, 'Unable to update your profile.'));
    } finally {
      this.profileSaving.set(false);
    }
  }

  protected openShareDialog(): void {
    if (!this.signedInUser()) {
      this.openAuthDialog();
      return;
    }
    this.postText.set('');
    this.clearSelectedFile();
    this.selectedPostBusiness.set(null);
    this.activeDialog.set('share');
  }

  protected openAuthDialog(): void {
    this.activeDialog.set('auth');
  }

  protected openMerchantDashboard(): void {
    if (this.signedInUser()) {
      if (this.auth.isMerchant()) {
        this.activeDialog.set('business-dashboard');
      } else {
        this.showToast('Use a separate merchant account to manage a place.');
      }
      return;
    }
    this.merchantAuthPending.set(true);
    this.openAuthDialog();
  }

  protected onAuthDialogAuthenticated(): void {
    if (this.merchantAuthPending()) {
      this.merchantAuthPending.set(false);
      if (this.auth.isMerchant()) {
        this.activeDialog.set('business-dashboard');
      } else {
        this.showToast('This is a consumer account. Create or use a separate merchant account.');
      }
    } else if (this.profileAuthPending() && this.selectedBusiness()) {
      this.profileAuthPending.set(false);
      this.navigate('profile');
    } else if (this.auth.needsConsumerOnboarding()) {
      this.activeDialog.set('onboarding');
    }
  }

  protected onAuthDialogClosed(): void {
    if (this.activeDialog() === 'auth') this.activeDialog.set(null);
    this.merchantAuthPending.set(false);
    this.profileAuthPending.set(false);
  }

  protected onOnboardingClosed(): void {
    this.activeDialog.set(null);
  }

  protected openBusiness(business: PublicBusiness): void {
    this.selectedBusiness.set(business);
    if (!this.signedInUser()) {
      this.profileAuthPending.set(true);
      this.openAuthDialog();
      return;
    }
    this.navigate('profile');
  }

  protected toggleDirections(): void {
    this.directionsOpen.update((open) => !open);
  }

  protected openBusinessById(businessId: string): void {
    const business = this.businesses().find((item) => item.id === businessId);
    if (business) this.openBusiness(business);
  }

  protected selectPostBusiness(business: PublicBusiness): void {
    if (this.isDemoBusiness(business)) {
      this.showToast('Sample businesses cannot be attached to a Firestore post.');
      return;
    }
    this.selectedPostBusiness.set(business);
    this.activeDialog.set('share');
  }

  protected isDemoBusiness(business: PublicBusiness): boolean {
    return business.verificationStatus === 'demo';
  }

  protected isSaved(businessId: string): boolean {
    return this.savedBusinesses().includes(businessId);
  }

  protected async toggleSaved(business: PublicBusiness): Promise<void> {
    const user = this.signedInUser();
    if (!user) {
      this.openAuthDialog();
      return;
    }

    this.savingBusinessIds.update((ids) => [...ids, business.id]);
    try {
      if (this.isSaved(business.id)) {
        await this.discovery.unsaveBusiness(user.uid, business.id);
      } else {
        await this.discovery.saveBusiness(user.uid, business.id);
      }
    } catch (error) {
      this.backendError.set(this.backendErrorMessage(error, 'Unable to save this place.'));
    } finally {
      this.savingBusinessIds.update((ids) => ids.filter((id) => id !== business.id));
    }
  }

  protected submitSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.searchTerm.set(target.value);
    }
  }

  protected applyMapSearch(event: SubmitEvent): void {
    event.preventDefault();
    this.searchTerm.update((query) => query.trim());
  }

  protected updatePostText(event: Event): void {
    if (event.target instanceof HTMLTextAreaElement) {
      this.postText.set(event.target.value);
    }
  }

  protected selectMedia(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const file = input.files?.item(0);
    if (!file) return;

    try {
      this.mediaStorage.validatePostMedia(file);
      this.clearSelectedFile();
      this.selectedFile.set(file);
      this.mediaPreviewUrl.set(URL.createObjectURL(file));
      input.value = '';
      this.backendError.set('');
    } catch (error) {
      this.backendError.set(error instanceof Error ? error.message : 'Unsupported media file.');
      input.value = '';
    }
  }

  protected clearSelectedFile(): void {
    const previewUrl = this.mediaPreviewUrl();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    this.mediaPreviewUrl.set('');
    this.selectedFile.set(null);
  }

  protected async publishPost(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const user = this.signedInUser();
    if (!user) {
      this.openAuthDialog();
      return;
    }

    if (!this.postText().trim()) return;
    if (this.isPublishing()) return;

    this.isPublishing.set(true);
    this.uploadProgress.set(this.selectedFile() ? 0 : null);
    this.backendError.set('');
    try {
      await this.discovery.publishPost(
        user.uid,
        (user.displayName?.trim() || user.email || user.phoneNumber || 'Lakvay Explorer').slice(
          0,
          80,
        ),
        user.photoURL ?? '',
        this.postText(),
        this.selectedFile(),
        (progress) => this.uploadProgress.set(progress),
        this.selectedPostBusiness(),
      );
      this.closeDialog();
      this.clearSelectedFile();
      this.selectedPostBusiness.set(null);
      this.showToast('Your discovery was published.');
    } catch (error) {
      this.backendError.set(this.backendErrorMessage(error, 'Unable to publish your post.'));
    } finally {
      this.uploadProgress.set(null);
      this.isPublishing.set(false);
    }
  }

  protected isPostLiked(postId: string): boolean {
    return this.likedPostIds().includes(postId);
  }

  protected async togglePostLike(post: PublicPost): Promise<void> {
    const user = this.signedInUser();
    if (!user) {
      this.openAuthDialog();
      return;
    }
    const liked = this.isPostLiked(post.id);
    try {
      await this.community.togglePostLike(user.uid, post, liked);
      this.likedPostIds.update((ids) =>
        liked ? ids.filter((id) => id !== post.id) : [...ids, post.id],
      );
    } catch (error) {
      this.backendError.set(this.backendErrorMessage(error, 'Unable to update the post reaction.'));
    }
  }

  protected beginComment(postId: string): void {
    if (!this.signedInUser()) {
      this.openAuthDialog();
      return;
    }
    this.commentPostId.set(postId);
    this.commentText.set('');
  }

  protected updateCommentText(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.commentText.set(event.target.value);
  }

  protected async submitComment(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const user = this.signedInUser();
    const postId = this.commentPostId();
    if (!user || !postId) return;
    try {
      await this.community.addPostComment(
        user.uid,
        postId,
        user.displayName ?? user.email ?? 'Lakvay Explorer',
        this.commentText(),
      );
      this.commentPostId.set(null);
      this.commentText.set('');
      this.showToast('Comment added.');
    } catch (error) {
      this.backendError.set(this.backendErrorMessage(error, 'Unable to add your comment.'));
    }
  }

  protected showToast(message: string): void {
    this.toast.set(message);
    if (this.toastTimeout !== undefined) window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => this.toast.set(''), 3600);
  }

  protected async signOut(): Promise<void> {
    try {
      await this.auth.signOut();
      this.showToast('You are signed out.');
    } catch (error) {
      this.backendError.set(error instanceof Error ? error.message : 'Unable to sign out.');
    }
  }

  private backendErrorMessage(error: unknown, fallback: string): string {
    const message = error instanceof Error ? error.message : fallback;
    if (message.toLowerCase().includes('requires an index')) {
      return 'The community feed needs a Firestore composite index. Deploy firestore.indexes.json, then refresh.';
    }
    return message;
  }

  private setBusinesses(businesses: PublicBusiness[]): void {
    this.businesses.set(businesses);
    this.demoBusinessesActive.set(true);
  }

  protected openTagLocation(): void {
    this.navigate('map');
    this.closeDialog();
  }

  protected closeDialog(): void {
    if (this.isPublishing()) return;
    this.activeDialog.set(null);
    this.clearSelectedFile();
    this.selectedPostBusiness.set(null);
  }
}
