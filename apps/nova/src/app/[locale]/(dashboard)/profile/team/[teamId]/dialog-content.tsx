import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollText, Target } from '@tuturuuu/ui/icons';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'goals' | 'reports' | 'des';
}

export function TeamActionDialog({ isOpen, onClose, type }: DialogProps) {
  const content = {
    goals: {
      title: 'Team Goals',
      icon: <Target className="text-primary h-5 w-5" />,
      description: 'Set and track your team objectives',
      content: (
        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Current Goals</h3>
            <p className="text-muted-foreground text-sm">
              No active goals set for this team.
            </p>
          </div>
        </div>
      ),
    },
    reports: {
      title: 'Team Reports',
      icon: <ScrollText className="text-primary h-5 w-5" />,
      description: 'View team performance reports',
      content: (
        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Available Reports</h3>
            <p className="text-muted-foreground text-sm">
              No reports generated yet.
            </p>
          </div>
        </div>
      ),
    },

    des: {
      title: 'Team Description',
      icon: <ScrollText className="text-primary h-5 w-5" />,
      description: 'View team performance reports',
      content: (
        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4">
            <h3 className="font-medium">Available Reports</h3>
            <p className="text-muted-foreground text-sm">
              No reports generated yet.
            </p>
          </div>
        </div>
      ),
    },
  };

  const selectedContent = content[type];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedContent.icon}
            {selectedContent.title}
          </DialogTitle>
          <DialogDescription>{selectedContent.description}</DialogDescription>
        </DialogHeader>
        {selectedContent.content}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
