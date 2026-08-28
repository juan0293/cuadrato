import { AbstractControl, ValidationErrors } from '@angular/forms';

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Valida teléfono básico internacional para evitar datos vacíos o inválidos en operación. */
export const phoneValidator = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();
  if (!value) return null;
  return /^\+?[0-9\s-]{7,20}$/.test(value) ? null : { invalidPhone: true };
};
