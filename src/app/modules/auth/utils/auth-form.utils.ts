import { AbstractControl, ValidationErrors } from '@angular/forms';

/** Valida un mínimo de fortaleza para evitar contraseñas triviales en formularios internos. */
export const passwordStrengthValidator = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '');
  if (!value) return null;
  return value.length >= 6 ? null : { weakPassword: true };
};
