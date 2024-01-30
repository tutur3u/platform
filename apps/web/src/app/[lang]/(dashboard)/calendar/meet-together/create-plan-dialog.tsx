import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useTranslation from 'next-translate/useTranslation';

export default function CreatePlanDialog() {
  const { t } = useTranslation('meet-together');

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="relative inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-rose-400 to-orange-300 px-8 py-2 font-bold text-white transition-all md:text-lg dark:from-rose-400/60 dark:to-orange-300/60">
          {t('create-plan')}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription>
            Create a new plan to meet together with your friends, family, or
            colleagues.
          </DialogDescription>
        </DialogHeader>
        <div className="grid items-center gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="My plan" />
        </div>
        <DialogFooter>
          <Button type="submit">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
