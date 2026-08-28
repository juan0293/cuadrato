import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-searchable-select',
  templateUrl: './searchable-select.component.html',
  styleUrls: ['./searchable-select.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchableSelectComponent implements OnChanges {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() items: any[] = [];
  @Input() displayKey = 'nombre';
  @Input() valueKey = 'id';
  @Input() searchKeys: string[] = ['nombre'];
  @Input() selectedId?: string;
  @Input() emptyText = 'No hay registros disponibles';
  @Input() manageLabel?: string;
  @Input() helperText = '';
  @Input() modalDescription = 'Selecciona un registro disponible del catálogo.';
  @Input() eyebrowKey?: string;
  @Input() descriptionKey?: string;
  @Input() metaKeys: string[] = [];
  @Input() searchPlaceholder = 'Buscar...';
  @Input() initialVisibleLimit = 40;
  @Input() filteredVisibleLimit = 80;

  @Output() selected = new EventEmitter<any>();
  @Output() manage = new EventEmitter<void>();

  isOpen = false;
  query = '';
  filteredItems: any[] = [];
  visibleItems: any[] = [];
  totalResults = 0;
  hasMoreResults = false;

  ngOnChanges(_: SimpleChanges): void {
    this.applyFilter();
  }

  open(): void {
    this.isOpen = true;
    this.query = '';
    this.applyFilter();
  }

  close(): void {
    this.isOpen = false;
  }

  onSearch(event: Event): void {
    const value = (event as CustomEvent<{ value?: string }>)?.detail?.value;
    this.query = String(value || '');
    this.applyFilter();
  }

  selectItem(item: any): void {
    this.selected.emit(item);
    this.close();
  }

  triggerManage(): void {
    this.manage.emit();
    this.close();
  }

  get selectedLabel(): string {
    const selected = this.selectedItem;
    return selected?.[this.displayKey] || this.placeholder;
  }

  isSelected(item: any): boolean {
    return String(item?.[this.valueKey]) === String(this.selectedId || '');
  }

  get selectedItem(): any | undefined {
    return this.items.find((item) => String(item?.[this.valueKey]) === String(this.selectedId || ''));
  }

  getItemValue(item: any, key?: string): string {
    if (!key) return '';
    return String(item?.[key] ?? '').trim();
  }

  getMetaEntries(item: any): Array<{ key: string; value: string }> {
    return this.metaKeys
      .map((key) => ({ key, value: String(item?.[key] ?? '').trim() }))
      .filter((entry) => !!entry.value);
  }

  trackByValue = (_: number, item: any): string => String(item?.[this.valueKey] ?? _);

  private applyFilter(): void {
    const q = this.query.trim().toLowerCase();
    if (!q) {
      this.filteredItems = this.items;
      this.totalResults = this.items.length;
      this.hasMoreResults = this.items.length > this.initialVisibleLimit;
      this.visibleItems = this.items.slice(0, this.initialVisibleLimit);
      return;
    }

    this.filteredItems = this.items.filter((item) =>
      this.searchKeys.some((key) => String(item?.[key] || '').toLowerCase().includes(q)),
    );
    this.totalResults = this.filteredItems.length;
    this.hasMoreResults = this.filteredItems.length > this.filteredVisibleLimit;
    this.visibleItems = this.filteredItems.slice(0, this.filteredVisibleLimit);
  }
}
