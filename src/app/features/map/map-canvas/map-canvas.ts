import { afterNextRender, Component, DestroyRef, effect, ElementRef, inject, input, output, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { PublicBusiness } from '../../../data-access/discovery-data';

@Component({
  imports: [],
  selector: 'app-map-canvas',
  styles: `
    :host {
      display: block;
      height: 100%;
      isolation: isolate;
      overflow: hidden;
      position: relative;
      width: 100%;
      z-index: 0;
    }
  `,
  templateUrl: './map-canvas.html',
})
export class MapCanvas {
  readonly businesses = input<PublicBusiness[]>([]);
  readonly selectionMode = input(false);
  readonly selectedLocation = input<readonly [number, number] | null>(null);
  readonly businessSelected = output<PublicBusiness>();
  readonly locationSelected = output<readonly [number, number]>();

  private readonly mapElement = viewChild.required<ElementRef<HTMLDivElement>>('mapElement');
  private readonly destroyRef = inject(DestroyRef);
  private map: L.Map | null = null;
  private markerLayer: L.LayerGroup | null = null;
  private selectedMarker: L.Marker | null = null;
  private readonly handleMapKeydown = (event: KeyboardEvent): void => {
    if (!this.selectionMode() || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    const center = this.map?.getCenter();
    if (center) this.locationSelected.emit([center.lat, center.lng]);
  };

  constructor() {
    effect(() =>
      this.renderMap(this.businesses(), this.selectionMode(), this.selectedLocation()),
    );
    afterNextRender(() => this.initializeMap());
    this.destroyRef.onDestroy(() => {
      this.map?.getContainer().removeEventListener('keydown', this.handleMapKeydown);
      this.map?.remove();
    });
  }

  private initializeMap(): void {
    this.map = L.map(this.mapElement().nativeElement).setView([10.695, 122.565], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(this.map);
    this.markerLayer = L.layerGroup().addTo(this.map);
    this.map.on('click', (event: L.LeafletMouseEvent) => {
      if (!this.selectionMode()) return;
      this.locationSelected.emit([event.latlng.lat, event.latlng.lng]);
    });
    this.mapElement().nativeElement.addEventListener('keydown', this.handleMapKeydown);
    this.renderMap(this.businesses(), this.selectionMode(), this.selectedLocation());
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  private renderMap(
    businesses: PublicBusiness[],
    selectionMode: boolean,
    selectedLocation: readonly [number, number] | null,
  ): void {
    if (!this.map || !this.markerLayer) return;

    this.markerLayer.clearLayers();
    this.selectedMarker = null;
    const mappableBusinesses = businesses.filter(
      (business) => business.latitude !== null && business.longitude !== null,
    );

    for (const business of mappableBusinesses) {
      const marker = L.marker([business.latitude!, business.longitude!], {
        icon: L.divIcon({
          className: 'lakvay-map-marker',
          html: '<span class="block h-4 w-4 rounded-full border-[3px] border-white bg-[#bd005e] shadow-[0_2px_10px_rgba(0,0,0,0.35)]"></span>',
          iconAnchor: [8, 8],
          iconSize: [16, 16],
        }),
        title: business.name,
      });
      marker.bindPopup(this.createPopupContent(business));
      marker.on('click', () => {
        if (!this.selectionMode()) this.businessSelected.emit(business);
      });
      this.markerLayer.addLayer(marker);
    }

    if (selectionMode && selectedLocation) {
      this.selectedMarker = L.marker([selectedLocation[0], selectedLocation[1]], {
        draggable: true,
        icon: this.selectedPinIcon(),
        title: 'Selected business location',
        zIndexOffset: 1000,
      }).addTo(this.markerLayer);
      this.selectedMarker.on('dragend', () => {
        const position = this.selectedMarker?.getLatLng();
        if (position) this.locationSelected.emit([position.lat, position.lng]);
      });
      this.map.setView(
        [selectedLocation[0], selectedLocation[1]],
        Math.max(this.map.getZoom(), 15),
      );
    } else if (mappableBusinesses.length === 1) {
      const [business] = mappableBusinesses;
      this.map.setView([business.latitude!, business.longitude!], 15);
    } else if (mappableBusinesses.length > 1) {
      const bounds = L.latLngBounds(
        mappableBusinesses.map((business) => [business.latitude!, business.longitude!]),
      );
      this.map.fitBounds(bounds, { maxZoom: 14, padding: [32, 32] });
    } else if (selectionMode) {
      this.map.setView([10.695, 122.565], 14);
    }
  }

  private selectedPinIcon(): L.DivIcon {
    return L.divIcon({
      className: 'lakvay-selected-pin',
      html: '<span class="block h-6 w-6 rotate-[-45deg] rounded-[50%_50%_50%_0] border-2 border-white bg-[#bd005e] shadow-lg"></span>',
      iconAnchor: [12, 28],
      iconSize: [24, 28],
    });
  }

  private createPopupContent(business: PublicBusiness): HTMLElement {
    const container = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = business.name;
    container.append(name);

    const details = document.createElement('p');
    details.textContent = [business.category, business.address].filter(Boolean).join(' · ');
    if (details.textContent) container.append(details);

    const link = document.createElement('span');
    link.className = 'mt-1 block font-semibold text-[#8d0047]';
    link.textContent = 'Open place details';
    container.append(link);
    return container;
  }
}
