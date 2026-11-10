import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import * as L from 'leaflet';

type Coordinates = [number, number];

@Component({
  selector: 'app-directions-map',
  templateUrl: './directions-map.html',
  styles: `
    :host { display: block; height: 100%; min-height: 20rem; }
  `,
})
export class DirectionsMap {
  readonly destination = input.required<Coordinates>();
  protected readonly locating = signal(false);
  protected readonly error = signal('');
  protected readonly distance = signal('');
  protected readonly duration = signal('');
  private readonly mapElement = viewChild.required<ElementRef<HTMLDivElement>>('mapElement');
  private readonly destroyRef = inject(DestroyRef);
  private map: L.Map | null = null;
  private layer: L.LayerGroup | null = null;

  constructor() {
    effect(() => {
      const destination = this.destination();
      if (this.map) this.renderDestination(destination);
    });
    afterNextRender(() => this.initialize());
    this.destroyRef.onDestroy(() => this.map?.remove());
  }

  protected locateMe(): void {
    if (!navigator.geolocation) {
      this.error.set('Location services are not available in this browser.');
      return;
    }
    this.locating.set(true);
    this.error.set('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const origin: Coordinates = [
          position.coords.latitude,
          position.coords.longitude,
        ];
        this.renderRoute(origin, this.destination());
        this.locating.set(false);
      },
      () => {
        this.error.set('Allow location access to show directions from your current position.');
        this.locating.set(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  private initialize(): void {
    this.map = L.map(this.mapElement().nativeElement).setView(this.destination(), 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);
    this.renderDestination(this.destination());
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  private renderDestination(destination: Coordinates): void {
    if (!this.map || !this.layer) return;
    this.layer.clearLayers();
    L.marker(destination, {
      icon: L.divIcon({
        className: 'lakvay-selected-pin',
        html: '<span class="material-symbols-outlined rounded-full border-2 border-white bg-[#bd005e] p-1 text-white shadow-lg">location_on</span>',
        iconAnchor: [16, 32],
        iconSize: [32, 32],
      }),
    }).bindPopup('Destination').addTo(this.layer);
    this.map.setView(destination, Math.max(this.map.getZoom(), 15));
  }

  private async renderRoute(
    origin: Coordinates,
    destination: Coordinates,
  ): Promise<void> {
    if (!this.map || !this.layer) return;
    this.renderDestination(destination);
    const routeUrl =
      `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};` +
      `${destination[1]},${destination[0]}?overview=full&geometries=geojson`;
    try {
      const response = await fetch(routeUrl);
      if (!response.ok) throw new Error('Route service unavailable.');
      const data = (await response.json()) as {
        routes?: Array<{ distance: number; duration: number; geometry: GeoJSON.LineString }>;
      };
      const route = data.routes?.[0];
      if (!route) throw new Error('No route found.');
      const line = L.geoJSON(route.geometry, {
        style: { color: '#bd005e', weight: 5, opacity: 0.85 },
      }).addTo(this.layer);
      L.marker(origin).bindPopup('Your location').addTo(this.layer);
      this.map.fitBounds(line.getBounds(), { padding: [28, 28] });
      this.distance.set(`${(route.distance / 1000).toFixed(1)} km`);
      this.duration.set(`${Math.round(route.duration / 60)} min drive`);
    } catch {
      this.error.set('Directions could not be loaded. The destination is still marked on the map.');
    }
  }
}
