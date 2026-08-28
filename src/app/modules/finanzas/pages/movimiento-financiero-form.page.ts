import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { Subscription, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { categoriasGasto, categoriasIngreso } from '../helpers/finanzas.helper';
import { EvidenciaMovimiento, MovimientoFinanciero } from '../models/movimiento-financiero.model';
import { CategoriasFinancierasService, CategoriaFinanciera } from '../services/categorias-financieras.service';
import { FinanzasService } from '../services/finanzas.service';

type TipoVisualMovimiento = 'ingreso' | 'gasto' | 'ajuste' | 'transferencia';
interface EvidenciaLocal extends EvidenciaMovimiento {
  id: string;
  file?: File;
  previewUrl?: string;
  subiendo?: boolean;
  progreso?: number;
  error?: string;
}

@Component({
  standalone: false,
  selector: 'app-movimiento-financiero-form',
  templateUrl: './movimiento-financiero-form.page.html',
  styleUrls: ['./movimiento-financiero-form.page.scss'],
})
export class MovimientoFinancieroFormPage implements OnInit, OnDestroy {
  readonly categoriasIngreso = categoriasIngreso;
  readonly categoriasGasto = categoriasGasto;

  readonly tiposVisuales: Array<{ value: TipoVisualMovimiento; label: string }> = [
    { value: 'ingreso', label: 'Ingreso' },
    { value: 'gasto', label: 'Gasto' },
    { value: 'ajuste', label: 'Ajuste' },
    { value: 'transferencia', label: 'Transferencia' },
  ];

  readonly metodosPago = ['efectivo', 'tarjeta', 'transferencia', 'credito', 'otro'];
  readonly estados = ['activo', 'pendiente', 'anulado'];

  readonly form = this.fb.nonNullable.group({
    tipoVisual: ['gasto' as TipoVisualMovimiento, Validators.required],
    naturaleza: ['gasto' as MovimientoFinanciero['tipo'], Validators.required],
    categoria: ['', Validators.required],
    monto: [0, [Validators.required, Validators.min(1)]],
    metodoPago: ['efectivo'],
    fecha: [new Date().toISOString().slice(0, 16), Validators.required],
    referencia: [''],
    descripcion: ['', Validators.required],
    observacion: [''],
    estado: ['activo'],
    artistaId: [''],
    citaId: [''],
  });

  readonly categoriaForm = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    descripcion: [''],
    icono: ['pricetag-outline'],
    color: ['#3b82f6'],
    estado: ['activo' as 'activo' | 'inactivo'],
  });

  loading = true;
  saving = false;
  sinConexion = false;
  movimientosRecientes: MovimientoFinanciero[] = [];

  categoriasLoading = true;
  categoriasSaving = false;
  categoriasEliminando = false;
  categoriaSelectorOpen = false;
  categoriaCrudModalOpen = false;
  categoriaSearchTerm = '';
  categoriaEditandoId: string | null = null;
  categorias: CategoriaFinanciera[] = [];
  categoriasFiltradas: CategoriaFinanciera[] = [];
  readonly maxFileSizeBytes = 10 * 1024 * 1024;
  readonly allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  evidencias: EvidenciaLocal[] = [];
  uploadLoading = false;
  dragOver = false;

  private readonly sub = new Subscription();

  constructor(
    private readonly fb: FormBuilder,
    private readonly finanzasService: FinanzasService,
    private readonly categoriasFinancierasService: CategoriasFinancierasService,
    private readonly authService: AuthService,
    private readonly toastService: ToastService,
    private readonly alertCtrl: AlertController,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.finanzasService.list().subscribe({
        next: (items) => {
          this.movimientosRecientes = [...(items || [])]
            .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
            .slice(0, 20);
          this.cargarMovimientosRecientes();
          this.calcularKpisFinancieros();
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.movimientosRecientes = [];
        },
      }),
    );

    this.sub.add(
      this.categoriasFinancierasService.list().subscribe({
        next: (items) => {
          this.categorias = (items || []).filter((item) => item.estado !== 'inactivo');
          this.categoriasLoading = false;
          this.filtrarCategorias(this.categoriaSearchTerm);
          this.seedCategoriasDefaultIfNeeded();
        },
        error: () => {
          this.categoriasLoading = false;
          this.categorias = [];
          this.categoriasFiltradas = [];
        },
      }),
    );
  }

  ngOnDestroy(): void {
    this.releasePreviewUrls();
    this.sub.unsubscribe();
  }

  onTipoVisualChange(tipo: TipoVisualMovimiento): void {
    const normalizado = this.normalizarTipoMovimiento(tipo);
    this.form.patchValue({
      naturaleza: normalizado,
      categoria: this.categoriasActivas(normalizado)[0] || this.form.controls.categoria.value,
    });
  }

  categoriasActivas(tipo: MovimientoFinanciero['tipo']): string[] {
    const catalogo = this.categorias.map((c) => c.nombre);
    if (catalogo.length) return catalogo;
    return tipo === 'ingreso' ? this.categoriasIngreso : this.categoriasGasto;
  }

  cargarMovimientosRecientes(): void {
    this.movimientosRecientes = [...this.movimientosRecientes]
      .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
      .slice(0, 12);
  }

  calcularKpisFinancieros(): void {
    // Método reservado para claridad arquitectónica.
  }

  abrirSelectorCategoria(): void {
    this.categoriaSelectorOpen = true;
    this.categoriaSearchTerm = '';
    this.filtrarCategorias('');
  }

  cerrarSelectorCategoria(): void {
    this.categoriaSelectorOpen = false;
  }

  filtrarCategorias(term: string): void {
    const q = String(term || '').toLowerCase().trim();
    this.categoriaSearchTerm = term;
    if (!q) {
      this.categoriasFiltradas = [...this.categorias];
      return;
    }

    this.categoriasFiltradas = this.categorias.filter((item) => {
      const nombre = String(item.nombre || '').toLowerCase();
      const descripcion = String(item.descripcion || '').toLowerCase();
      return nombre.includes(q) || descripcion.includes(q);
    });
  }

  seleccionarCategoria(categoria: CategoriaFinanciera): void {
    this.form.patchValue({ categoria: categoria.nombre });
    this.cerrarSelectorCategoria();
  }

  abrirNuevaCategoria(): void {
    this.categoriaEditandoId = null;
    this.categoriaForm.reset({
      nombre: '',
      descripcion: '',
      icono: 'pricetag-outline',
      color: '#3b82f6',
      estado: 'activo',
    });
    this.categoriaCrudModalOpen = true;
  }

  editarCategoria(categoria: CategoriaFinanciera): void {
    this.categoriaEditandoId = categoria.id || null;
    this.categoriaForm.patchValue({
      nombre: categoria.nombre,
      descripcion: categoria.descripcion || '',
      icono: categoria.icono || 'pricetag-outline',
      color: categoria.color || '#3b82f6',
      estado: categoria.estado,
    });
    this.categoriaCrudModalOpen = true;
  }

  cerrarCrudCategoria(): void {
    this.categoriaCrudModalOpen = false;
  }

  async guardarCategoria(): Promise<void> {
    if (!this.validarCategoria()) return;

    try {
      this.categoriasSaving = true;
      const raw = this.categoriaForm.getRawValue();
      const payload: CategoriaFinanciera = {
        nombre: raw.nombre.trim(),
        descripcion: raw.descripcion.trim() || undefined,
        icono: raw.icono.trim() || undefined,
        color: raw.color.trim() || undefined,
        estado: raw.estado,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (this.categoriaEditandoId) {
        await this.categoriasFinancierasService.update(this.categoriaEditandoId, payload);
      } else {
        await this.crearCategoria(payload);
      }

      this.cerrarCrudCategoria();
      await this.toastService.success('Categoría creada correctamente.');
    } catch (error) {
      const code = String((error as { code?: unknown })?.code || '');
      if (code.includes('permission-denied')) {
        await this.toastService.error('No tienes permisos para crear/editar categorías financieras.');
      } else if (code.includes('unavailable')) {
        await this.toastService.error('Necesitas conexión para sincronizar las categorías.');
      } else {
        await this.toastService.error('No pudimos guardar la categoría. Verifica permisos o conexión.');
      }
    } finally {
      this.categoriasSaving = false;
    }
  }

  async crearCategoria(payload: CategoriaFinanciera): Promise<void> {
    await this.categoriasFinancierasService.create(payload);
  }

  async eliminarCategoria(categoria: CategoriaFinanciera): Promise<void> {
    if (!categoria.id) return;

    const asociados = this.movimientosRecientes.some((item) => String(item.categoria || '').toLowerCase() === String(categoria.nombre || '').toLowerCase());
    if (asociados) {
      await this.toastService.error('Esta acción puede afectar movimientos relacionados. Categoría en uso.');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Eliminar categoría',
      message: 'Esta acción puede afectar movimientos relacionados.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            try {
              this.categoriasEliminando = true;
              await this.categoriasFinancierasService.update(categoria.id as string, { estado: 'inactivo' });
              await this.toastService.success('Categoría eliminada.');
            } catch (error) {
              const code = String((error as { code?: unknown })?.code || '');
              if (code.includes('permission-denied')) {
                await this.toastService.error('No tienes permisos para eliminar categorías financieras.');
              } else if (code.includes('unavailable')) {
                await this.toastService.error('Necesitas conexión para sincronizar las categorías.');
              } else {
                await this.toastService.error('No pudimos eliminar la categoría. Verifica permisos o conexión.');
              }
            } finally {
              this.categoriasEliminando = false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  validarCategoria(): boolean {
    if (this.categoriaForm.invalid) {
      void this.toastService.error('Completa el nombre de la categoría.');
      return false;
    }
    return true;
  }

  async guardarMovimientoFinanciero(): Promise<void> {
    if (this.saving) return;
    if (!this.validarMovimiento()) return;

    try {
      this.saving = true;
      const user = await firstValueFrom(this.authService.user$);
      const raw = this.form.getRawValue();

      const payload: MovimientoFinanciero = {
        tipo: raw.naturaleza,
        categoria: raw.categoria,
        monto: Number(raw.monto),
        descripcion: this.buildDescripcionPersistida(raw.descripcion, raw.referencia, raw.observacion, raw.metodoPago, raw.estado),
        artistaId: raw.artistaId || undefined,
        citaId: raw.citaId || undefined,
        fecha: raw.fecha ? new Date(raw.fecha).toISOString() : new Date().toISOString(),
        creadoPor: user?.uid ?? 'sistema',
      };

      const movimientoId = await this.finanzasService.create(payload);
      if (this.evidencias.length) {
        await this.subirEvidencias(movimientoId);
      }
      await this.toastService.success('Movimiento financiero registrado.');
      this.limpiarFormulario();
      await this.router.navigateByUrl('/admin/finanzas');
    } catch {
      this.sinConexion = true;
      await this.toastService.error('No pudimos guardar el movimiento.');
    } finally {
      this.saving = false;
    }
  }

  limpiarFormulario(): void {
    this.releasePreviewUrls();
    this.form.reset({
      tipoVisual: 'ingreso',
      naturaleza: 'ingreso',
      categoria: this.categoriasActivas('ingreso')[0] || 'tatuaje',
      monto: 0,
      metodoPago: 'efectivo',
      fecha: new Date().toISOString().slice(0, 16),
      referencia: '',
      descripcion: '',
      observacion: '',
      estado: 'activo',
      artistaId: '',
      citaId: '',
    });
    this.sinConexion = false;
    this.evidencias = [];
  }

  validarMovimiento(): boolean {
    if (this.form.invalid) {
      void this.toastService.error('Completa los datos financieros.');
      return false;
    }

    const raw = this.form.getRawValue();
    if (!raw.descripcion.trim()) {
      void this.toastService.error('Agrega una descripción clara para mantener la trazabilidad.');
      return false;
    }

    if (this.toNumber(raw.monto) <= 0) {
      void this.toastService.error('Ingresa un monto válido.');
      return false;
    }

    return true;
  }

  calcularImpactoMovimiento(): number {
    const monto = this.toNumber(this.form.controls.monto.value);
    return this.form.controls.naturaleza.value === 'gasto' ? -monto : monto;
  }

  normalizarTipoMovimiento(tipo: TipoVisualMovimiento): MovimientoFinanciero['tipo'] {
    if (tipo === 'gasto') return 'gasto';
    if (tipo === 'ajuste') return this.form.controls.naturaleza.value;
    if (tipo === 'transferencia') return 'gasto';
    return 'ingreso';
  }

  getMovimientoBadge(tipo: string): string {
    if (tipo === 'ingreso') return 'badge-ingreso';
    if (tipo === 'gasto') return 'badge-gasto';
    if (tipo === 'ajuste') return 'badge-ajuste';
    if (tipo === 'transferencia') return 'badge-transferencia';
    return 'badge-transferencia';
  }

  getEstadoBadge(estado: string): string {
    return estado === 'anulado' ? 'badge-anulado' : 'badge-activo';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(this.toNumber(value));
  }

  formatDate(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-DO', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  }

  onSubmit(): void {
    void this.guardarMovimientoFinanciero();
  }

  get selectedCategoriaLabel(): string {
    return this.form.controls.categoria.value || 'Selecciona una categoría';
  }

  get categoriasRecientes(): CategoriaFinanciera[] {
    const recientes = new Set(this.movimientosRecientes.slice(0, 8).map((item) => item.categoria));
    return this.categorias.filter((c) => recientes.has(c.nombre)).slice(0, 6);
  }

  get ingresosHoy(): number {
    return this.movimientosRecientes
      .filter((m) => this.esHoy(m.fecha) && m.tipo === 'ingreso')
      .reduce((acc, m) => acc + this.toNumber(m.monto), 0);
  }

  get gastosHoy(): number {
    return this.movimientosRecientes
      .filter((m) => this.esHoy(m.fecha) && m.tipo === 'gasto')
      .reduce((acc, m) => acc + this.toNumber(m.monto), 0);
  }

  get balanceHoy(): number {
    return this.ingresosHoy - this.gastosHoy;
  }

  get movimientosRegistrados(): number {
    return this.movimientosRecientes.length;
  }

  get totalMetodoPrincipal(): string {
    const map = new Map<string, number>();
    for (const item of this.movimientosRecientes) {
      const metodo = this.getMetodoPago(item);
      map.set(metodo, (map.get(metodo) || 0) + this.toNumber(item.monto));
    }
    let top = '—';
    let max = -1;
    map.forEach((value, key) => {
      if (value > max) {
        max = value;
        top = key;
      }
    });
    return top;
  }

  get categoriaPrincipal(): string {
    const map = new Map<string, number>();
    for (const item of this.movimientosRecientes) {
      map.set(item.categoria, (map.get(item.categoria) || 0) + this.toNumber(item.monto));
    }
    let top = '—';
    let max = -1;
    map.forEach((value, key) => {
      if (value > max) {
        max = value;
        top = key;
      }
    });
    return top;
  }

  get ultimoMovimiento(): string {
    return this.movimientosRecientes.length ? this.formatDate(this.movimientosRecientes[0].fecha) : 'Sin movimientos';
  }

  get promedioMovimiento(): number {
    if (!this.movimientosRecientes.length) return 0;
    const total = this.movimientosRecientes.reduce((acc, item) => acc + this.toNumber(item.monto), 0);
    return total / this.movimientosRecientes.length;
  }

  getMetodoPago(item: MovimientoFinanciero): string {
    const text = String(item.descripcion || '');
    const match = text.match(/Metodo:\s*([^|\]]+)/i);
    return match ? match[1].trim() : 'efectivo';
  }

  getEstado(item: MovimientoFinanciero): string {
    const text = String(item.descripcion || '');
    const match = text.match(/Estado:\s*([^|\]]+)/i);
    return match ? match[1].trim().toLowerCase() : 'activo';
  }

  getCategoriaConteo(nombre: string): number {
    return this.movimientosRecientes.filter((item) => String(item.categoria || '').toLowerCase() === String(nombre || '').toLowerCase()).length;
  }

  get cantidadEvidencias(): number {
    return this.evidencias.length;
  }

  get totalSizeEvidencias(): number {
    return this.evidencias.reduce((acc, item) => acc + this.toNumber(item.size), 0);
  }

  get ultimoArchivoAdjunto(): string {
    return this.evidencias.length ? this.evidencias[this.evidencias.length - 1].nombre : 'Sin adjuntos';
  }

  seleccionarArchivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.procesarArchivos(files);
    input.value = '';
  }

  onDropArchivos(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    const files = Array.from(event.dataTransfer?.files || []);
    this.procesarArchivos(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = true;
  }

  onDragLeave(): void {
    this.dragOver = false;
  }

  validarArchivo(file: File): boolean {
    if (!this.allowedMimeTypes.includes(file.type)) {
      void this.toastService.error('Formato no permitido. Solo puedes subir archivos PDF o imágenes.');
      return false;
    }
    if (file.size > this.maxFileSizeBytes) {
      void this.toastService.error('El archivo supera el tamaño máximo permitido de 10MB.');
      return false;
    }
    if (this.evidencias.some((item) => item.nombre === file.name && item.size === file.size)) {
      void this.toastService.error('Ese archivo ya fue adjuntado.');
      return false;
    }
    return true;
  }

  async subirArchivo(movimientoId: string, evidencia: EvidenciaLocal): Promise<EvidenciaLocal> {
    const storage = getStorage();
    const ext = evidencia.nombre.includes('.') ? evidencia.nombre.split('.').pop() : 'bin';
    const safeExt = String(ext || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `movimientos-financieros/${movimientoId}/evidencias/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    const fileRef = ref(storage, path);
    if (!evidencia.file) throw new Error('No existe archivo local para subir.');
    const uploadTask = uploadBytesResumable(fileRef, evidencia.file, { contentType: evidencia.tipo });

    evidencia.subiendo = true;
    evidencia.progreso = 0;
    evidencia.error = '';

    return await new Promise<EvidenciaLocal>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
          evidencia.progreso = progress;
        },
        (error) => {
          evidencia.subiendo = false;
          evidencia.error = String(error?.message || 'No pudimos subir el archivo.');
          reject(error);
        },
        async () => {
          evidencia.subiendo = false;
          evidencia.progreso = 100;
          evidencia.url = await getDownloadURL(uploadTask.snapshot.ref);
          evidencia.path = path;
          evidencia.fecha = new Date().toISOString();
          resolve(evidencia);
        },
      );
    });
  }

  async eliminarArchivo(evidencia: EvidenciaLocal): Promise<void> {
    if (evidencia.subiendo) return;
    if (evidencia.path) {
      try {
        await deleteObject(ref(getStorage(), evidencia.path));
      } catch {
        // Se ignora fallo de limpieza remota para no bloquear UX.
      }
    }
    if (evidencia.previewUrl) URL.revokeObjectURL(evidencia.previewUrl);
    this.evidencias = this.evidencias.filter((item) => item.id !== evidencia.id);
  }

  abrirArchivo(evidencia: EvidenciaLocal): void {
    const target = evidencia.url || evidencia.previewUrl;
    if (!target) return;
    window.open(target, '_blank', 'noopener');
  }

  descargarArchivo(evidencia: EvidenciaLocal): void {
    const target = evidencia.url || evidencia.previewUrl;
    if (!target) return;
    const link = document.createElement('a');
    link.href = target;
    link.download = evidencia.nombre;
    link.target = '_blank';
    link.rel = 'noopener';
    link.click();
  }

  obtenerIconoArchivo(tipo: string): string {
    if (String(tipo).includes('pdf')) return 'document-text-outline';
    return 'image-outline';
  }

  formatFileSize(size: number): string {
    const value = this.toNumber(size);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(String(value || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private procesarArchivos(files: File[]): void {
    if (!navigator.onLine) {
      this.sinConexion = true;
      void this.toastService.error('Necesitas conexión para subir evidencias.');
      return;
    }

    for (const file of files) {
      if (!this.validarArchivo(file)) continue;
      const isImage = String(file.type).startsWith('image/');
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
      const evidencia: EvidenciaLocal = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        nombre: file.name,
        tipo: file.type,
        size: file.size,
        path: '',
        url: '',
        fecha: new Date().toISOString(),
        file,
        previewUrl,
        progreso: 0,
      };
      this.evidencias.push(evidencia);
    }
  }

  private async subirEvidencias(movimientoId: string): Promise<void> {
    this.uploadLoading = true;
    try {
      const uploaded: EvidenciaMovimiento[] = [];
      for (const evidencia of this.evidencias) {
        const saved = await this.subirArchivo(movimientoId, evidencia);
        uploaded.push({
          nombre: saved.nombre,
          tipo: saved.tipo,
          url: saved.url,
          path: saved.path,
          size: saved.size,
          fecha: saved.fecha,
        });
      }
      await this.finanzasService.update(movimientoId, { evidencias: uploaded });
      this.evidencias = this.evidencias.map((item) => ({ ...item, file: undefined }));
      await this.toastService.success('Archivo adjuntado correctamente.');
    } catch {
      await this.toastService.error('No pudimos subir el archivo.');
    } finally {
      this.uploadLoading = false;
    }
  }

  private releasePreviewUrls(): void {
    for (const item of this.evidencias) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
  }

  private esHoy(fecha: string): boolean {
    const d = new Date(fecha);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }

  private buildDescripcionPersistida(
    descripcion: string,
    referencia: string,
    observacion: string,
    metodoPago: string,
    estado: string,
  ): string {
    const base = descripcion.trim();
    const chunks = [
      referencia.trim() ? `Ref: ${referencia.trim()}` : '',
      metodoPago.trim() ? `Metodo: ${metodoPago.trim()}` : '',
      estado.trim() ? `Estado: ${estado.trim()}` : '',
      observacion.trim() ? `Obs: ${observacion.trim()}` : '',
    ].filter(Boolean);

    return chunks.length ? `${base} [${chunks.join(' | ')}]` : base;
  }

  private async seedCategoriasDefaultIfNeeded(): Promise<void> {
    if (this.categorias.length) return;
    const defaults = [...this.categoriasIngreso, ...this.categoriasGasto];
    for (const nombre of defaults) {
      await this.categoriasFinancierasService.create({
        nombre,
        estado: 'activo',
        icono: 'pricetag-outline',
        color: '#3b82f6',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
