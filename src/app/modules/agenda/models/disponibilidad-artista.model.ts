export interface DisponibilidadArtista {
  id?: string;
  artistaId: string;
  diaSemana: string;
  horaInicio: string;
  horaFin: string;
  disponible: boolean;
  motivoBloqueo?: string;
}
