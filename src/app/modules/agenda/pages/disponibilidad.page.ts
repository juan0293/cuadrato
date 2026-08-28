import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { AlertController } from '@ionic/angular';
import { Subscription, combineLatest, firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { UsuarioModel } from '../../usuarios/models/usuario.model';
import { UsuariosService } from '../../usuarios/services/usuarios.service';
import { DisponibilidadArtista } from '../models/disponibilidad-artista.model';
import { DisponibilidadService } from '../services/disponibilidad.service';

type EstadoFiltro = 'todos' | 'disponible' | 'no-disponible';

interface DisponibilidadViewItem extends DisponibilidadArtista {
  artistaNombre: string;
}

@Component({
  standalone: false,
  selector: 'app-disponibilidad-page',
  templateUrl: './disponibilidad.page.html',
  styleUrls: ['./disponibilidad.page.scss'],
})
export class DisponibilidadPage implements OnInit, OnDestroy {
  readonly artistas$ = this.usuariosService.list();
  readonly disponibilidad$ = this.disponibilidadService.list();

  readonly form = this.fb.nonNullable.group({
    artistaId: ['', Validators.required],
    diaSemana: ['monday', Validators.required],
    horaInicio: ['09:00', Validators.required],
    horaFin: ['18:00', Validators.required],
    disponible: [true],
    motivoBloqueo: [''],
  });

  readonly filtrosForm = this.fb.nonNullable.group({
    busqueda: [''],
    estado: ['todos' as EstadoFiltro],
    diaSemana: ['todos'],
    artistaId: ['todos'],
  });

  loading = true;
  allItems: DisponibilidadViewItem[] = [];
  filteredItems: DisponibilidadViewItem[] = [];
  alertasCriticas = 0;
  ultimaActualizacion = '—';

  private readonly sub = new Subscription();

  constructor(
    private readonly fb: FormBuilder,
    private readonly disponibilidadService: DisponibilidadService,
    private readonly usuariosService: UsuariosService,
    private readonly toastService: ToastService,
    private readonly alertCtrl: AlertController,
  ) {}

  ngOnInit(): void {
    this.sub.add(
      combineLatest([this.disponibilidad$, this.artistas$]).subscribe({
        next: ([disponibilidad, usuarios]) => {
          const artists = this.onlyArtists(usuarios);
          this.allItems = (disponibilidad ?? []).map((item) => ({
            ...item,
            artistaNombre: artists.find((a) => a.id === item.artistaId)?.nombre || 'Artista',
          }));
          this.applyFilters();
          this.loading = false;
          this.ultimaActualizacion = new Date().toLocaleString('es-DO');
        },
        error: async () => {
          this.loading = false;
          await this.toastService.error('No fue posible cargar disponibilidad.');
        },
      }),
    );

    this.sub.add(this.filtrosForm.valueChanges.subscribe(() => this.applyFilters()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  get totalRegistros(): number {
    return this.filteredItems.length;
  }

  get totalDisponibles(): number {
    return this.filteredItems.filter((i) => i.disponible).length;
  }

  get totalNoDisponibles(): number {
    return this.filteredItems.filter((i) => !i.disponible).length;
  }

  get disponibilidadPorcentaje(): number {
    if (!this.filteredItems.length) return 0;
    return Math.round((this.totalDisponibles / this.filteredItems.length) * 100);
  }

  get totalPendientes(): number {
    return 0;
  }

  get totalEnProceso(): number {
    return 0;
  }

  onlyArtists(users: UsuarioModel[] | null): UsuarioModel[] {
    return (users ?? []).filter((item) => {
      const role = item.role ?? item.rol;
      const isArtist = role === 'artista' || role === 'artist';
      const isActive = item.status ? item.status === 'active' : item.activo;
      return isArtist && isActive;
    });
  }

  formatDiaSemana(diaSemana: string): string {
    const days: Record<string, string> = {
      monday: 'Lunes',
      tuesday: 'Martes',
      wednesday: 'Miércoles',
      thursday: 'Jueves',
      friday: 'Viernes',
      saturday: 'Sábado',
      sunday: 'Domingo',
    };
    return days[diaSemana] || diaSemana;
  }

  getEstadoColor(item: DisponibilidadArtista): 'success' | 'medium' {
    return item.disponible ? 'success' : 'medium';
  }

  getEstadoLabel(item: DisponibilidadArtista): string {
    return item.disponible ? 'Disponible' : 'No disponible';
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      await this.toastService.error('Completa los datos de disponibilidad.');
      return;
    }

    const raw = this.form.getRawValue();
    const artists = await firstValueFrom(this.usuariosService.list());
    const artist = this.onlyArtists(artists).find((item) => item.id === raw.artistaId);

    if (!artist) {
      await this.toastService.error('Selecciona un artista válido.');
      return;
    }

    const payload: DisponibilidadArtista = {
      artistaId: raw.artistaId,
      diaSemana: raw.diaSemana,
      horaInicio: raw.horaInicio,
      horaFin: raw.horaFin,
      disponible: raw.disponible,
      motivoBloqueo: raw.disponible ? undefined : raw.motivoBloqueo?.trim() || undefined,
    };

    try {
      await this.disponibilidadService.create(payload);
      await this.toastService.success('Disponibilidad registrada.');
      this.form.patchValue({ motivoBloqueo: '', disponible: true });
    } catch {
      await this.toastService.error('No fue posible registrar disponibilidad.');
    }
  }

  async toggleDisponibilidad(item: DisponibilidadViewItem): Promise<void> {
    if (!item.id) return;

    let motivoBloqueo = item.motivoBloqueo || '';
    if (item.disponible) {
      const alert = await this.alertCtrl.create({
        header: 'Marcar no disponible',
        message: 'Opcionalmente registra un motivo de bloqueo.',
        inputs: [{ name: 'motivo', type: 'text', placeholder: 'Motivo de bloqueo' }],
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Guardar', role: 'confirm' },
        ],
      });
      await alert.present();
      const result = await alert.onDidDismiss();
      if (result.role !== 'confirm') return;
      motivoBloqueo = String(result.data?.values?.motivo || '').trim();
    }

    try {
      await this.disponibilidadService.update(item.id, {
        disponible: !item.disponible,
        motivoBloqueo: item.disponible ? (motivoBloqueo || undefined) : undefined,
      });
      await this.toastService.success('Estado actualizado.');
    } catch {
      await this.toastService.error('No fue posible actualizar el estado.');
    }
  }

  private applyFilters(): void {
    const filters = this.filtrosForm.getRawValue();
    const q = String(filters.busqueda || '').trim().toLowerCase();
    this.filteredItems = this.allItems.filter((item) => {
      const matchesText = !q || [
        item.artistaNombre,
        this.formatDiaSemana(item.diaSemana),
        item.horaInicio,
        item.horaFin,
        item.motivoBloqueo,
      ].some((value) => String(value || '').toLowerCase().includes(q));

      const matchesEstado =
        filters.estado === 'todos'
        || (filters.estado === 'disponible' && item.disponible)
        || (filters.estado === 'no-disponible' && !item.disponible);

      const matchesDia = filters.diaSemana === 'todos' || item.diaSemana === filters.diaSemana;
      const matchesArtista = filters.artistaId === 'todos' || item.artistaId === filters.artistaId;
      return matchesText && matchesEstado && matchesDia && matchesArtista;
    });

    this.alertasCriticas = this.filteredItems.filter((item) => !item.disponible).length;
  }
}
