import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Compra } from '../../models/compra.model';
import { PdfCompraService } from '../../services/pdf-compra.service';
import { EcfDraftPreview, EcfDraftService } from '../../services/ecf-draft.service';

@Component({
  selector: 'app-ecf-preview',
  templateUrl: './ecf-preview.page.html',
  styleUrls: ['./ecf-preview.page.scss'],
  standalone: false,
})
export class EcfPreviewPage implements OnInit, OnDestroy {
  preview?: EcfDraftPreview;
  page = 1;
  pageSize = 10;
  readonly pageSizeOptions = [10, 20, 50];
  private previewSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly ecfDraftService: EcfDraftService,
    private readonly pdfCompraService: PdfCompraService,
  ) {}

  ngOnInit(): void {
    const compraId = this.route.snapshot.paramMap.get('compraId') ?? '';
    if (!compraId) {
      this.router.navigateByUrl('/admin/inventario/compras');
      return;
    }

    this.previewSub = this.ecfDraftService.getPreviewByCompraId(compraId).subscribe((preview) => {
      this.preview = preview;
      this.page = 1;
    });
  }

  ngOnDestroy(): void {
    this.previewSub?.unsubscribe();
  }

  imprimirCompra(compra: Compra): void {
    this.pdfCompraService.imprimirCompra(compra);
  }

  guardarPdf(compra: Compra): void {
    this.pdfCompraService.guardarPdfCompra(compra);
  }

  abrirPdf(compra: Compra): void {
    this.pdfCompraService.abrirPreviewCompra(compra);
  }

  volverACompras(): void {
    this.router.navigateByUrl('/admin/inventario/compras');
  }

  get pagedLines() {
    const lines = this.preview?.lines || [];
    const start = (this.page - 1) * this.pageSize;
    return lines.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    const total = this.preview?.lines?.length || 0;
    return Math.max(1, Math.ceil(total / this.pageSize));
  }

  get canGoPrev(): boolean {
    return this.page > 1;
  }

  get canGoNext(): boolean {
    return this.page < this.totalPages;
  }

  prevPage(): void {
    if (!this.canGoPrev) return;
    this.page -= 1;
  }

  nextPage(): void {
    if (!this.canGoNext) return;
    this.page += 1;
  }

  onPageSizeChange(value: string | number): void {
    const parsed = Number(value);
    this.pageSize = this.pageSizeOptions.includes(parsed) ? parsed : 10;
    this.page = 1;
  }
}
