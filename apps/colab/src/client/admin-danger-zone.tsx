import { Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useCopy } from './i18n';

export function AdminDangerZone({
  isOwner,
  busy,
  onDelete,
}: {
  isOwner: boolean;
  busy: boolean;
  onDelete: () => Promise<void>;
}) {
  const c = useCopy();
  return (
    <div className="admin-tab-content">
      <div className="admin-tab-heading">
        <div>
          <h3>{c.dangerZone}</h3>
          <p>{c.dangerZoneHelp}</p>
        </div>
        <Trash2 className="size-5 text-destructive" aria-hidden="true" />
      </div>
      <div className="danger-card">
        <div>
          <h4>{c.deleteWorkshop}</h4>
          <p>{isOwner ? c.deleteWorkshopHelp : c.ownerDeleteOnly}</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" disabled={!isOwner || busy}>
              <Trash2 className="size-4" aria-hidden="true" />
              {c.deleteWorkshop}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{c.deleteWorkshopConfirm}</DialogTitle>
              <DialogDescription>
                {c.deleteWorkshopConfirmHelp}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{c.cancel}</Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void onDelete()}
              >
                {busy ? c.working : c.deletePermanently}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
