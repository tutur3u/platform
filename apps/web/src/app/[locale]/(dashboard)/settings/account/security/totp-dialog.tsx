'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  ArrowLeft,
  Copy,
  Shield,
  Smartphone,
  Trash2,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@tuturuuu/ui/input-otp';
import { Label } from '@tuturuuu/ui/label';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface TOTPFactor {
  id: string;
  friendly_name: string;
  factor_type: string;
  status: 'unverified' | 'verified';
  created_at: string;
}

interface EnrollmentData {
  id: string;
  type: string;
  totp: {
    qr_code: string;
    secret: string;
    uri: string;
  };
}

type ViewState = 'list' | 'add-new';

export default function TOTPDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [viewState, setViewState] = useState<ViewState>('list');
  const [factors, setFactors] = useState<TOTPFactor[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentData | null>(
    null
  );
  const [friendlyName, setFriendlyName] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Fetch existing factors
  const fetchFactors = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/mfa/totp/factors');
      if (!response.ok) throw new Error('Failed to fetch factors');

      const data = await response.json();
      setFactors(data.totp || []);
    } catch (error) {
      console.error('Error fetching factors:', error);
      toast.error('Failed to load TOTP factors');
    } finally {
      setLoading(false);
    }
  };

  // Create new TOTP factor
  const createFactor = async () => {
    if (!friendlyName.trim()) {
      toast.error('Please enter a friendly name');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/auth/mfa/totp/factors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendlyName: friendlyName.trim() }),
      });

      if (!response.ok) throw new Error('Failed to create factor');

      const data = await response.json();
      setEnrollmentData(data);
    } catch (error) {
      console.error('Error creating factor:', error);
      toast.error('Failed to create TOTP factor');
    } finally {
      setLoading(false);
    }
  };

  // Verify TOTP factor
  const verifyFactor = async () => {
    if (!enrollmentData || verificationCode.length !== 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    try {
      setIsVerifying(true);
      const response = await fetch(
        `/api/auth/mfa/totp/factors/${enrollmentData.id}/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: verificationCode }),
        }
      );

      if (!response.ok) throw new Error('Verification failed');

      toast.success('TOTP factor verified successfully!');

      // Reset state and go back to list
      setEnrollmentData(null);
      setFriendlyName('');
      setVerificationCode('');
      setViewState('list');
      fetchFactors(); // Refresh the list
    } catch (error) {
      console.error('Error verifying factor:', error);
      toast.error('Verification failed. Please check your code.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Delete TOTP factor
  const deleteFactor = async (factorId: string) => {
    try {
      const response = await fetch(`/api/auth/mfa/totp/factors/${factorId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete factor');

      toast.success('TOTP factor deleted successfully');
      fetchFactors(); // Refresh the list
    } catch (error) {
      console.error('Error deleting factor:', error);
      toast.error('Failed to delete TOTP factor');
    }
  };

  // Copy secret to clipboard
  const copySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success('Secret copied to clipboard');
    } catch (error) {
      console.error('Error copying secret:', error);
      toast.error('Failed to copy secret');
    }
  };

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      fetchFactors();
      setViewState('list');
      setEnrollmentData(null);
      setFriendlyName('');
      setVerificationCode('');
    }
  }, [isOpen, fetchFactors]);

  const renderFactorsList = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <DialogTitle>TOTP Authenticator</DialogTitle>
          <DialogDescription>
            Manage your time-based one-time password (TOTP) factors
          </DialogDescription>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {factors.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <Smartphone className="mb-4 h-12 w-12 text-muted-foreground" />
                <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
                  <p>No TOTP factors configured yet.</p>
                  <p>Add one to enhance your account security.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            factors.map((factor) => (
              <Card key={factor.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-3">
                    <Shield className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium">{factor.friendly_name}</p>
                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={
                            factor.status === 'verified'
                              ? 'default'
                              : 'secondary'
                          }
                          className="text-xs"
                        >
                          {factor.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Added{' '}
                          {new Date(factor.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteFactor(factor.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      <Button
        onClick={() => setViewState('add-new')}
        className="w-full"
        disabled={loading}
      >
        Add New TOTP Factor
      </Button>
    </div>
  );

  const renderAddNewView = () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setViewState('list');
            setEnrollmentData(null);
            setFriendlyName('');
            setVerificationCode('');
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <DialogTitle>Add New TOTP Factor</DialogTitle>
          <DialogDescription>
            Set up a new authenticator app for two-factor authentication
          </DialogDescription>
        </div>
      </div>

      {!enrollmentData ? (
        // Step 1: Enter friendly name
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Step 1: Name Your Device</CardTitle>
            <CardDescription>
              Give this authenticator a friendly name to identify it later
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="friendlyName">Friendly Name</Label>
              <Input
                id="friendlyName"
                placeholder="e.g., iPhone Authenticator, Work Phone"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                disabled={loading}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              onClick={createFactor}
              disabled={!friendlyName.trim() || loading}
              className="w-full"
            >
              {loading ? 'Creating...' : 'Continue'}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        // Step 2: Scan QR and verify
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 2: Scan QR Code</CardTitle>
              <CardDescription>
                Use your authenticator app to scan this QR code
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <Skeleton className="mx-auto h-48 w-48" />
              ) : (
                <div className="flex flex-col items-center space-y-4">
                  <div className="rounded-lg bg-white p-2 shadow-sm">
                    <Image
                      src={enrollmentData.totp.qr_code.trim()}
                      alt="TOTP QR Code"
                      width={192}
                      height={192}
                      className="h-48 w-48 rounded-lg"
                    />
                  </div>

                  <div className="w-full space-y-2">
                    <Label className="text-sm">
                      Manual Entry Code (if QR doesn't work)
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Input
                        readOnly
                        value={enrollmentData.totp.secret}
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copySecret(enrollmentData.totp.secret)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Step 3: Verify Setup</CardTitle>
              <CardDescription>
                Enter the 6-digit code from your authenticator app
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={verificationCode}
                  onChange={setVerificationCode}
                  disabled={isVerifying}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <InputOTPSlot key={index} index={index} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={verifyFactor}
                disabled={verificationCode.length !== 6 || isVerifying}
                className="w-full"
              >
                {isVerifying ? 'Verifying...' : 'Verify & Complete Setup'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Shield className="mr-2 h-4 w-4" />
          Manage TOTP
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>TOTP Management</DialogTitle>
          <DialogDescription>Manage your TOTP factors</DialogDescription>
        </DialogHeader>

        {viewState === 'list' ? renderFactorsList() : renderAddNewView()}
      </DialogContent>
    </Dialog>
  );
}
