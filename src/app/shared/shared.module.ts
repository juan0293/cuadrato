import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { SkeletonCardComponent } from './components/skeleton-card/skeleton-card.component';
import { SearchableSelectComponent } from './components/searchable-select/searchable-select.component';
import { OperationProgressComponent } from './components/operation-progress/operation-progress.component';

@NgModule({
  declarations: [EmptyStateComponent, SkeletonCardComponent, SearchableSelectComponent, OperationProgressComponent],
  imports: [CommonModule, IonicModule],
  exports: [EmptyStateComponent, SkeletonCardComponent, SearchableSelectComponent, OperationProgressComponent],
})
export class SharedModule {}
