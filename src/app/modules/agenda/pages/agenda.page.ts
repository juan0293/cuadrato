import { Component, OnDestroy, OnInit } from '@angular/core';
import { AlertController, ActionSheetController } from '@ionic/angular';
import { Router } from '@angular/router';
import { addDays, format } from 'date-fns';
import { Subscription } from 'rxjs';
import { CalendarOptions, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { ToastService } from '../../../core/services/toast.service';
import { obtenerColorEstadoCita, obtenerEstadoCitaLabel } from '../helpers/agenda.helper';
import { Cita } from '../models/cita.model';
import { AgendaService } from '../services/agenda.service';
import { toISODate } from '../utils/agenda-date.utils';

interface DayCell {
  date: string;
  label: string;
  dayName: string;
}

@Component({
  standalone: false,
  selector: 'app-agenda',
  templateUrl: './agenda.page.html',
  styleUrls: ['./agenda.page.scss'],
})
export class AgendaPage implements OnInit, OnDestroy {
  selectedDate = toISODate(new Date());
  calendarEvents: EventInput[] = [];
  days: DayCell[] = [];
  allCitas: Cita[] = [];
  dayCitas: Cita[] = [];
  loading = true;
  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'timeGridDay',
    locale: 'es',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay',
    },
    editable: true,
    selectable: true,
    selectMirror: true,
    dayMaxEvents: true,
    allDaySlot: false,
    slotMinTime: '08:00:00',
    slotMaxTime: '22:00:00',
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    events: [],
    dateClick: (arg) => this.onCalendarDateClick(arg),
    eventClick: (arg) => this.onCalendarEventClick(arg),
    eventDrop: (arg) => this.onCalendarEventDrop(arg),
  };

  private sub?: Subscription;

  constructor(
    private readonly agendaService: AgendaService,
    private readonly toastService: ToastService,
    private readonly actionSheetCtrl: ActionSheetController,
    private readonly alertCtrl: AlertController,
    private readonly router: Router,
  ) {
    this.rebuildDays();
  }

  ngOnInit(): void {
    this.sub = this.agendaService.getCitas().subscribe({
      next: (items) => {
        this.allCitas = [...items].sort((a, b) => (`${a.fecha} ${a.horaInicio}`).localeCompare(`${b.fecha} ${b.horaInicio}`));
        this.calendarEvents = this.mapCitasToEvents(this.allCitas);
        this.calendarOptions = {
          ...this.calendarOptions,
          initialDate: `${this.selectedDate}T00:00:00`,
          events: this.calendarEvents,
        };
        this.refreshDay();
        this.loading = false;
      },
      error: async () => {
        this.loading = false;
        await this.toastService.error('No fue posible cargar la agenda.');
      },
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get kpiCitasDia(): number {
    return this.dayCitas.length;
  }

  get kpiPendientes(): number {
    return this.dayCitas.filter((c) => this.isPending(c.estado)).length;
  }

  get kpiAtendidas(): number {
    return this.dayCitas.filter((c) => c.estado === 'atendida' || c.estado === 'completada').length;
  }

  get kpiAnuladas(): number {
    return this.dayCitas.filter((c) => c.estado === 'anulada' || c.estado === 'cancelada').length;
  }

  get kpiClientes(): number {
    return new Set(this.dayCitas.map((c) => `${c.clienteId || ''}-${c.clienteNombre}`)).size;
  }

  get kpiHorasOcupadas(): number {
    const minutes = this.dayCitas.reduce((acc, c) => acc + (c.duracionMinutos || this.diffMinutes(c.horaInicio, c.horaFin)), 0);
    return Number((minutes / 60).toFixed(1));
  }

  get proximaCita(): string {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const next = this.dayCitas.find((c) => this.toMinutes(c.horaInicio) >= nowMinutes && this.isPending(c.estado));
    return next ? `${next.horaInicio} · ${next.clienteNombre}` : 'Sin próxima cita';
  }

  get timelineHours(): string[] {
    return Array.from({ length: 13 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`);
  }

  citasByHour(hour: string): Cita[] {
    return this.dayCitas.filter((c) => c.horaInicio.slice(0, 2) === hour.slice(0, 2));
  }

  onSelectDate(date: string): void {
    this.selectedDate = date;
    this.calendarOptions = {
      ...this.calendarOptions,
      initialDate: `${this.selectedDate}T00:00:00`,
    };
    this.rebuildDays();
    this.refreshDay();
  }

  goToday(): void {
    this.selectedDate = toISODate(new Date());
    this.calendarOptions = {
      ...this.calendarOptions,
      initialDate: `${this.selectedDate}T00:00:00`,
    };
    this.rebuildDays();
    this.refreshDay();
  }

  goPreviousDay(): void {
    this.selectedDate = toISODate(addDays(new Date(`${this.selectedDate}T00:00:00`), -1));
    this.calendarOptions = {
      ...this.calendarOptions,
      initialDate: `${this.selectedDate}T00:00:00`,
    };
    this.rebuildDays();
    this.refreshDay();
  }

  goNextDay(): void {
    this.selectedDate = toISODate(addDays(new Date(`${this.selectedDate}T00:00:00`), 1));
    this.calendarOptions = {
      ...this.calendarOptions,
      initialDate: `${this.selectedDate}T00:00:00`,
    };
    this.rebuildDays();
    this.refreshDay();
  }

  async openActions(cita: Cita): Promise<void> {
    const buttons: any[] = [
      { text: 'Ver / Editar', icon: 'create-outline', handler: () => this.router.navigate(['/admin/agenda/citas', cita.id]) },
      { text: 'Facturar cita', icon: 'receipt-outline', handler: () => this.router.navigate(['/admin/facturacion'], { queryParams: { citaId: cita.id } }) },
      { text: 'Mover cita', icon: 'swap-horizontal-outline', handler: () => this.moverCita(cita) },
      { text: 'Marcar atendida', icon: 'checkmark-done-outline', handler: () => this.marcarAtendida(cita) },
      { text: 'Anular cita', icon: 'ban-outline', role: 'destructive', handler: () => this.anularCita(cita) },
      { text: 'Cerrar', role: 'cancel', icon: 'close-outline' },
    ];
    const sheet = await this.actionSheetCtrl.create({ header: 'Acciones de cita', buttons });
    await sheet.present();
  }

  estadoLabel(estado: Cita['estado']): string {
    return obtenerEstadoCitaLabel(estado);
  }

  estadoColor(estado: Cita['estado']): string {
    return obtenerColorEstadoCita(estado);
  }

  formatDop(value?: number): string {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  private refreshDay(): void {
    this.dayCitas = this.allCitas
      .filter((c) => c.fecha === this.selectedDate)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
  }

  private mapCitasToEvents(citas: Cita[]): EventInput[] {
    return citas.map((cita) => {
      const start = `${cita.fecha}T${cita.horaInicio}:00`;
      const end = `${cita.fecha}T${cita.horaFin}:00`;
      const colorMap: Record<string, string> = {
        pendiente: '#f59e0b',
        programada: '#3b82f6',
        confirmada: '#38bdf8',
        reprogramada: '#a78bfa',
        atendida: '#34d399',
        completada: '#22c55e',
        anulada: '#f87171',
        cancelada: '#ef4444',
      };
      return {
        id: cita.id,
        title: `${cita.clienteNombre} · ${cita.artistaNombre}`,
        start,
        end,
        backgroundColor: colorMap[cita.estado] || '#3b82f6',
        borderColor: colorMap[cita.estado] || '#3b82f6',
        textColor: '#ffffff',
        extendedProps: { cita },
      };
    });
  }

  private onCalendarDateClick(arg: { date: Date }): void {
    const day = toISODate(arg.date);
    this.onSelectDate(day);
  }

  private async onCalendarEventClick(arg: EventClickArg): Promise<void> {
    const cita = arg.event.extendedProps?.['cita'] as Cita | undefined;
    if (!cita) return;
    await this.openActions(cita);
  }

  /**
   * Persist drag&drop changes directly in agenda service to keep calendar and Firestore synchronized.
   */
  private async onCalendarEventDrop(arg: EventDropArg): Promise<void> {
    const cita = arg.event.extendedProps?.['cita'] as Cita | undefined;
    if (!cita?.id || !arg.event.start || !arg.event.end) {
      arg.revert();
      return;
    }

    const fecha = toISODate(arg.event.start);
    const horaInicio = format(arg.event.start, 'HH:mm');
    const horaFin = format(arg.event.end, 'HH:mm');

    try {
      await this.agendaService.moverCita(cita.id, { fecha, horaInicio, horaFin });
      this.selectedDate = fecha;
      this.rebuildDays();
      this.refreshDay();
      await this.toastService.success('Cita movida correctamente.');
    } catch {
      arg.revert();
      await this.toastService.error('No fue posible mover la cita en el calendario.');
    }
  }

  private rebuildDays(): void {
    const base = new Date(`${this.selectedDate}T00:00:00`);
    this.days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(base, i - 3);
      return {
        date: toISODate(date),
        label: format(date, 'dd/MM'),
        dayName: format(date, 'EEE'),
      };
    });
  }

  private async marcarAtendida(cita: Cita): Promise<void> {
    if (!cita.id) return;
    try {
      await this.agendaService.marcarAtendida(cita.id);
      await this.toastService.success('Cita marcada como atendida.');
    } catch {
      await this.toastService.error('No fue posible actualizar el estado.');
    }
  }

  private async moverCita(cita: Cita): Promise<void> {
    if (!cita.id) return;

    const alert = await this.alertCtrl.create({
      header: 'Mover cita',
      inputs: [
        { name: 'fecha', type: 'date', value: cita.fecha },
        { name: 'horaInicio', type: 'time', value: cita.horaInicio },
        { name: 'horaFin', type: 'time', value: cita.horaFin },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async (value) => {
            try {
              await this.agendaService.moverCita(cita.id as string, {
                fecha: String(value.fecha || cita.fecha),
                horaInicio: String(value.horaInicio || cita.horaInicio),
                horaFin: String(value.horaFin || cita.horaFin),
              });
              await this.toastService.success('Cita reprogramada correctamente.');
            } catch {
              await this.toastService.error('No fue posible mover la cita.');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  private async anularCita(cita: Cita): Promise<void> {
    if (!cita.id) return;

    const alert = await this.alertCtrl.create({
      header: 'Anular cita',
      message: 'Esta acción no eliminará la cita, solo la marcará como anulada para mantener trazabilidad.',
      inputs: [{ name: 'motivo', type: 'text', placeholder: 'Motivo (opcional)' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Anular',
          role: 'destructive',
          handler: async (value) => {
            try {
              await this.agendaService.anularCita(cita.id as string, String(value.motivo || ''));
              await this.toastService.success('Cita anulada.');
            } catch {
              await this.toastService.error('No fue posible anular la cita.');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  private isPending(estado: Cita['estado']): boolean {
    return ['pendiente', 'programada', 'confirmada', 'reprogramada'].includes(estado);
  }

  private toMinutes(hour: string): number {
    const [h, m] = hour.split(':').map(Number);
    return (h * 60) + m;
  }

  private diffMinutes(start: string, end: string): number {
    return Math.max(0, this.toMinutes(end) - this.toMinutes(start));
  }
}
