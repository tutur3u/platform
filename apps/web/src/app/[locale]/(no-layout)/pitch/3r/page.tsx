'use client';

import { Button } from '@tuturuuu/ui/button';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Globe,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Settings,
  Target,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface Slide {
  id: number;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
  background?: string;
}

const SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
  }),
};

// Enhanced custom 3R logo with animated gradient effects
const CustomLogo = ({
  size = 'medium',
  animated = true,
  className,
}: {
  size?: 'small' | 'medium' | 'large';
  animated?: boolean;
  className?: string;
}) => {
  const sizeClass = {
    small: 'h-12 w-12 text-xl',
    medium: 'h-20 w-20 text-3xl md:h-28 md:w-28 md:text-4xl',
    large: 'h-32 w-32 text-5xl md:h-40 md:w-40 md:text-7xl',
  };

  return (
    <motion.div
      initial={animated ? { scale: 0.8, opacity: 0 } : false}
      animate={animated ? { scale: 1, opacity: 1 } : false}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      className={cn('relative', className)}
    >
      {/* Outer glow effect */}
      <div className="absolute inset-0 -z-20 rounded-full bg-gradient-to-br from-blue-500/30 via-purple-500/20 to-orange-500/30 blur-xl" />

      {/* Animated pulse ring */}
      <motion.div
        animate={{
          scale: [1, 1.05, 1],
          opacity: [0.5, 0.7, 0.5],
        }}
        transition={{
          repeat: Infinity,
          duration: 3,
          ease: 'easeInOut',
        }}
        className="absolute inset-0 -z-10 rounded-full bg-gradient-to-tr from-primary/20 via-blue-500/20 to-purple-500/20 blur-md"
      />

      {/* Main circle */}
      <div
        className={cn(
          'relative flex items-center justify-center rounded-full shadow-lg',
          'bg-gradient-to-br from-background via-background to-background/90 p-0.5',
          sizeClass[size]
        )}
      >
        {/* Inner gradient border */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-orange-500 opacity-70" />

        {/* Content container */}
        <div className="absolute inset-0.5 flex items-center justify-center rounded-full bg-background">
          {/* 3R text with gradient */}
          <span className="relative font-bold tracking-tight">
            <span className="absolute inset-0 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent blur-sm">
              3R
            </span>
            <span className="relative bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 bg-clip-text text-transparent">
              3R
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  );
};

const SlideWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="relative mx-auto w-full max-w-7xl"
  >
    {children}
  </motion.div>
);

// Reusable gradient background component
const GradientBackground = ({
  variant = 'default',
  intensity = 'medium',
  className,
  children,
}: {
  variant?:
    | 'default'
    | 'blue'
    | 'green'
    | 'purple'
    | 'orange'
    | 'pink'
    | 'cyan';
  intensity?: 'light' | 'medium' | 'strong';
  className?: string;
  children: React.ReactNode;
}) => {
  const variants = {
    default: 'from-blue-500/10 via-purple-500/5 to-transparent',
    blue: 'from-blue-500/20 via-indigo-500/10 to-transparent',
    green: 'from-emerald-500/20 via-green-500/10 to-transparent',
    purple: 'from-violet-500/20 via-purple-500/10 to-transparent',
    orange: 'from-orange-500/20 via-amber-500/10 to-transparent',
    pink: 'from-pink-500/20 via-rose-500/10 to-transparent',
    cyan: 'from-cyan-500/20 via-sky-500/10 to-transparent',
  };

  const intensities = {
    light: 'opacity-30',
    medium: 'opacity-50',
    strong: 'opacity-70',
  };

  return (
    <div className={cn('relative overflow-hidden rounded-xl', className)}>
      <div
        className={cn(
          'absolute inset-0 -z-10 bg-gradient-to-br',
          variants[variant],
          intensities[intensity]
        )}
      />
      <div className="relative z-0">{children}</div>
    </div>
  );
};

// Animated section header with gradient underline
const SectionHeader = ({
  title,
  subtitle,
  align = 'left',
  className,
}: {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}) => {
  const alignments = {
    left: 'text-left',
    center: 'text-center mx-auto',
    right: 'text-right ml-auto',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('mb-6', className)}
    >
      <h3 className={cn('relative text-xl font-bold', alignments[align])}>
        <span className="relative z-10">{title}</span>
        <span
          className={cn(
            'absolute bottom-0 left-0 -z-0 h-3 w-1/2 rounded-full bg-gradient-to-r from-primary/60 via-blue-500/40 to-transparent blur-sm',
            align === 'center' && 'left-1/4',
            align === 'right' && 'right-0 left-auto bg-gradient-to-l'
          )}
        />
      </h3>
      {subtitle && (
        <p className={cn('mt-1 text-sm text-foreground/70', alignments[align])}>
          {subtitle}
        </p>
      )}
    </motion.div>
  );
};

// Animated decorative background pattern
const DecorativeBackground = ({
  density = 'medium',
  className,
}: {
  density?: 'light' | 'medium' | 'high';
  className?: string;
}) => {
  const densitySettings = {
    light: { count: 20, opacityRange: [0.05, 0.1] },
    medium: { count: 40, opacityRange: [0.05, 0.15] },
    high: { count: 60, opacityRange: [0.03, 0.12] },
  };

  const { count, opacityRange } = densitySettings[density];
  const particles = Array.from({ length: count }).map((_, i) => {
    const size = Math.random() * 8 + 2; // 2-10px
    const opacity =
      Math.random() *
        ((opacityRange?.[1] ?? 0.1) - (opacityRange?.[0] ?? 0.05)) +
      (opacityRange?.[0] ?? 0.05);
    const left = Math.random() * 100; // 0-100%
    const top = Math.random() * 100; // 0-100%
    const delay = Math.random() * 5; // 0-5s delay
    const duration = Math.random() * 15 + 20; // 20-35s duration

    return { size, opacity, left, top, delay, duration, id: i };
  });

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full bg-gradient-to-r from-blue-500 to-primary"
          initial={{
            width: particle.size,
            height: particle.size,
            opacity: 0,
            left: `${particle.left}%`,
            top: `${particle.top}%`,
            filter: 'blur(1px)',
            scale: 0.5,
          }}
          animate={{
            opacity: [0, particle.opacity, particle.opacity, 0],
            y: [-20, 20],
            scale: [0.5, 1, 0.8, 0.5],
          }}
          transition={{
            delay: particle.delay,
            duration: particle.duration,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

// Define slides
const slides: Slide[] = [
  {
    id: 1,
    title: 'Máy 3R',
    subtitle: 'Chiến Dịch Marketing Vòng 2 GMC 2025',
    content: (
      <div className="relative flex flex-col items-center justify-center gap-12">
        {/* Decorative background */}
        <DecorativeBackground density="light" className="opacity-40" />

        {/* 3R Logo */}
        <div className="flex flex-col items-center">
          <CustomLogo size="large" />

          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="mt-6 flex items-center gap-2"
          >
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: 40 }}
              transition={{ delay: 0.7, duration: 1 }}
              className="h-0.5 bg-gradient-to-r from-transparent via-foreground/20 to-foreground/30"
            />
            <span className="text-sm font-medium tracking-wider text-foreground/60 uppercase">
              AP Saigon Petro
            </span>
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: 40 }}
              transition={{ delay: 0.7, duration: 1 }}
              className="h-0.5 bg-gradient-to-l from-transparent via-foreground/20 to-foreground/30"
            />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col items-center gap-6"
        >
          <h1 className="max-w-3xl text-center leading-tight font-bold">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="mb-3 block text-3xl sm:text-4xl md:text-5xl"
            >
              <span className="bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Thay nhớt siêu tốc
              </span>
            </motion.span>

            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0 }}
              className="mb-3 block text-2xl sm:text-3xl md:text-4xl"
            >
              <span className="bg-gradient-to-r from-emerald-500 via-green-600 to-teal-600 bg-clip-text text-transparent">
                Chuẩn xác từng giọt
              </span>
            </motion.span>

            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              className="block text-xl sm:text-2xl md:text-3xl"
            >
              <span className="bg-gradient-to-r from-amber-500 via-orange-600 to-pink-600 bg-clip-text text-transparent">
                Vì một môi trường tốt
              </span>
            </motion.span>
          </h1>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="relative"
          >
            <p className="max-w-2xl text-center text-lg leading-relaxed text-foreground/80">
              <span className="relative mx-2 font-medium whitespace-nowrap">
                <span className="relative z-10 px-1">Nhanh - Sạch - Xanh</span>
                <span className="absolute inset-0 -z-10 rounded-lg bg-gradient-to-r from-blue-500/20 via-green-500/20 to-purple-500/20" />
              </span>
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="mt-4 flex flex-col gap-4 md:flex-row"
          >
            <Button
              size="lg"
              className="group relative overflow-hidden border-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100" />
              <span className="relative flex items-center gap-2">
                Khám phá ngay
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Button>
          </motion.div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 2,
    title: 'Tính Năng Sản Phẩm',
    subtitle: 'Tìm hiểu về Máy 3R',
    content: (
      <div className="space-y-8">
        <div className="grid gap-8 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-6 rounded-xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent p-6"
          >
            <h3 className="text-center text-2xl font-bold text-blue-500">
              Máy Thay Nhớt Tự Động 3R
            </h3>

            <p className="text-center text-foreground/80">
              Thiết bị thay nhớt tự động đầu tiên dành cho xe gắn máy tại Việt
              Nam, phát triển bởi AP Saigon Petro, ra mắt tháng 11/2024.
            </p>

            <div className="grid grid-cols-2 gap-4">
              {[
                {
                  title: 'Nhanh chóng',
                  description: 'Thay nhớt trong 3 phút',
                  icon: <Clock className="h-8 w-8" />,
                },
                {
                  title: 'Chính xác',
                  description: 'Kiểm soát lượng nhớt chính xác',
                  icon: <CheckCircle className="h-8 w-8" />,
                },
                {
                  title: 'Thân thiện',
                  description: 'Thu gom nhớt thải hiệu quả',
                  icon: <Globe className="h-8 w-8" />,
                },
                {
                  title: 'Hiện đại',
                  description: 'Giao diện kỹ thuật số',
                  icon: <Settings className="h-8 w-8" />,
                },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="mb-2 rounded-full bg-blue-500/10 p-3 text-blue-500">
                    {feature.icon}
                  </div>
                  <h4 className="mb-1 font-semibold">{feature.title}</h4>
                  <p className="text-sm text-foreground/70">
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col gap-6 rounded-xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-6"
          >
            <h3 className="mb-2 text-xl font-bold text-emerald-500">
              Quy trình hoạt động
            </h3>

            <div className="space-y-4">
              {[
                {
                  step: '01',
                  title: 'Xác thực',
                  description: 'Quét mã QR hoặc nhập số điện thoại',
                },
                {
                  step: '02',
                  title: 'Nhận diện xe',
                  description: 'Xác nhận model xe máy',
                },
                {
                  step: '03',
                  title: 'Hút nhớt cũ',
                  description: 'Tự động hút sạch nhớt cũ',
                },
                {
                  step: '04',
                  title: 'Bơm nhớt mới',
                  description: 'Lượng nhớt chính xác theo tiêu chuẩn',
                },
                {
                  step: '05',
                  title: 'Hoàn thành',
                  description: 'Nhận biên lai điện tử',
                },
              ].map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex items-start gap-4 rounded-lg bg-foreground/5 p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <span className="text-sm font-bold">{step.step}</span>
                  </div>
                  <div>
                    <h4 className="font-medium">{step.title}</h4>
                    <p className="text-sm text-foreground/70">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    ),
  },
  {
    id: 3,
    title: 'Tổng Quan Thị Trường',
    subtitle: 'Market Overview',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: 'Thị trường xe máy Việt Nam',
              description: 'Quy mô lớn với nhu cầu bảo dưỡng cao',
              metrics: [
                { label: 'Lượng xe đang lưu hành', value: '65+ triệu' },
                { label: 'Tăng trưởng hàng năm', value: '8.5%' },
              ],
              icon: <BarChart3 className="h-6 w-6" />,
              color: 'text-blue-500',
              gradient: 'from-blue-500/20 via-blue-500/10 to-transparent',
            },
            {
              title: 'Thói quen thay nhớt',
              description: 'Thường xuyên nhưng chưa đồng bộ',
              metrics: [
                { label: 'Tần suất trung bình', value: '3-4 tháng/lần' },
                { label: 'Chi phí trung bình', value: '150-300K/lần' },
              ],
              icon: <RefreshCw className="h-6 w-6" />,
              color: 'text-emerald-500',
              gradient: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                'group relative overflow-hidden rounded-xl bg-gradient-to-br p-6',
                item.gradient
              )}
            >
              <div
                className={cn('absolute top-3 right-3 opacity-10', item.color)}
              >
                {item.icon}
              </div>
              <div className="relative flex flex-col gap-4">
                <div
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-background/80 to-background',
                    item.color
                  )}
                >
                  {item.icon}
                </div>
                <div>
                  <h3 className={cn('mb-2 text-xl font-bold', item.color)}>
                    {item.title}
                  </h3>
                  <p className="mb-4 text-foreground/80">{item.description}</p>
                  <div className="grid grid-cols-2 gap-4">
                    {item.metrics.map((metric, j) => (
                      <div key={j} className="text-center">
                        <div className={cn('text-lg font-bold', item.color)}>
                          {metric.value}
                        </div>
                        <div className="text-xs text-foreground/60">
                          {metric.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: 'Xu hướng công nghệ & tự động hóa',
              description: 'Chuyển đổi số trong dịch vụ xe máy',
              metrics: [
                { label: 'Thanh toán không tiền mặt', value: '60% tại đô thị' },
                { label: 'Đặt lịch online', value: '+125% YoY' },
              ],
              icon: <Settings className="h-6 w-6" />,
              color: 'text-violet-500',
              gradient: 'from-violet-500/20 via-violet-500/10 to-transparent',
            },
            {
              title: 'Xu hướng Marketing Xanh',
              description: 'Ngày càng được quan tâm',
              metrics: [
                { label: 'Gen Z quan tâm', value: '78%' },
                { label: 'Sẵn sàng chi thêm', value: '25%' },
              ],
              icon: <Globe className="h-6 w-6" />,
              color: 'text-amber-500',
              gradient: 'from-amber-500/20 via-amber-500/10 to-transparent',
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className={cn(
                'group relative overflow-hidden rounded-xl bg-gradient-to-br p-6',
                item.gradient
              )}
            >
              <div
                className={cn('absolute top-3 right-3 opacity-10', item.color)}
              >
                {item.icon}
              </div>
              <div className="relative flex flex-col gap-4">
                <div
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-background/80 to-background',
                    item.color
                  )}
                >
                  {item.icon}
                </div>
                <div>
                  <h3 className={cn('mb-2 text-xl font-bold', item.color)}>
                    {item.title}
                  </h3>
                  <p className="mb-4 text-foreground/80">{item.description}</p>
                  <div className="grid grid-cols-2 gap-4">
                    {item.metrics.map((metric, j) => (
                      <div key={j} className="text-center">
                        <div className={cn('text-lg font-bold', item.color)}>
                          {metric.value}
                        </div>
                        <div className="text-xs text-foreground/60">
                          {metric.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 4,
    title: 'Nhu Cầu & Điểm Đau',
    subtitle: 'Hiểu người dùng để giải quyết vấn đề của họ',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          <GradientBackground variant="orange" className="p-6">
            <SectionHeader title="Điểm đau của người dùng" />

            <div className="space-y-4">
              {[
                {
                  title: 'Mất thời gian chờ đợi',
                  description:
                    'Người dùng phải chờ đợi 30-45 phút để thay nhớt do quy trình thủ công',
                  icon: <Clock className="h-6 w-6" />,
                  color: 'orange',
                },
                {
                  title: 'Thiếu minh bạch',
                  description:
                    'Không rõ chính xác lượng nhớt được sử dụng và chất lượng nhớt',
                  icon: <XCircle className="h-6 w-6" />,
                  color: 'orange',
                },
                {
                  title: 'Không thuận tiện',
                  description:
                    'Thời gian mở cửa hạn chế, không linh hoạt với lịch trình bận rộn',
                  icon: <Clock className="h-6 w-6" />,
                  color: 'orange',
                },
              ].map((pain, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * i }}
                  className="flex items-start gap-4"
                >
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-orange-500">
                    {pain.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium">{pain.title}</h3>
                    <p className="text-sm text-foreground/70">
                      {pain.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </GradientBackground>

          <div className="flex flex-col gap-6">
            <GradientBackground variant="blue" className="flex-1 p-6">
              <SectionHeader title="Nhu cầu hàng đầu" />

              <div className="grid grid-cols-2 gap-4">
                {[
                  {
                    value: '91%',
                    label: 'Muốn tiết kiệm thời gian',
                    color: 'blue',
                  },
                  {
                    value: '85%',
                    label: 'Mong muốn sự minh bạch',
                    color: 'green',
                  },
                  {
                    value: '78%',
                    label: 'Quan tâm về môi trường',
                    color: 'purple',
                  },
                  {
                    value: '65%',
                    label: 'Ưa thích công nghệ mới',
                    color: 'pink',
                  },
                ].map((stat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    className="flex flex-col items-center text-center"
                  >
                    <div
                      className={`text-2xl font-bold text-${stat.color}-500`}
                    >
                      {stat.value}
                    </div>
                    <div className="mt-1 text-sm text-foreground/80">
                      {stat.label}
                    </div>
                  </motion.div>
                ))}
              </div>
            </GradientBackground>

            <GradientBackground variant="green" className="flex-1 p-6">
              <SectionHeader title="Cơ hội giải quyết" />

              <div className="space-y-3">
                {[
                  'Giảm thời gian chờ đợi từ 30-45 phút xuống còn 3 phút',
                  'Tạo ra trải nghiệm minh bạch và có thể theo dõi',
                  'Mang lại sự tiện lợi 24/7 với máy tự phục vụ',
                  'Đáp ứng xu hướng công nghệ và bảo vệ môi trường',
                ].map((opportunity, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="flex items-center gap-2"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/20">
                      <Check className="h-3 w-3 text-green-500" />
                    </div>
                    <p className="text-sm">{opportunity}</p>
                  </motion.div>
                ))}
              </div>
            </GradientBackground>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 5,
    title: 'Đối Tượng Mục Tiêu',
    subtitle: 'Target Audience',
    content: (
      <div className="space-y-8">
        <div className="grid gap-8 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent p-6"
          >
            <h3 className="mb-4 text-xl font-bold text-blue-500">
              Sự Kiện Triển Khai
            </h3>

            <div className="space-y-3">
              {[
                {
                  title: 'Lễ Ra Mắt & Họp Báo',
                  date: '15/11/2024',
                  location: 'Khách sạn Rex, TP.HCM',
                  highlight: 'Thu hút sự chú ý của báo chí và đối tác',
                },
                {
                  title: 'Triển Lãm InnoEx 2024',
                  date: '23/08/2024',
                  location: 'TP.HCM',
                  highlight: 'Ấn tượng với công nghệ xanh',
                },
                {
                  title: 'Diễn đàn Kinh tế tuần hoàn',
                  date: '12/09/2024',
                  location: 'Hải Phòng',
                  highlight: 'Được ủng hộ từ chuyên gia môi trường',
                },
              ].map((event, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="rounded-lg bg-foreground/5 p-4"
                >
                  <div className="mb-1 flex items-baseline justify-between">
                    <h4 className="font-medium text-blue-500">{event.title}</h4>
                    <span className="text-xs font-medium text-foreground/60">
                      {event.date}
                    </span>
                  </div>
                  <div className="mb-2 text-xs text-foreground/60">
                    {event.location}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-blue-500">
                    <CheckCircle className="h-3 w-3" />
                    {event.highlight}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col rounded-xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-6"
          >
            <h3 className="mb-4 text-xl font-bold text-emerald-500">
              Thành Công Thực Tế
            </h3>

            <div className="space-y-3">
              {[
                {
                  title: 'Quận 7, TP.HCM',
                  audience: 'Tài xế xe công nghệ',
                  metric: '300+ lượt sử dụng trong tuần đầu',
                },
                {
                  title: 'Lễ hội Ẩm thực chay',
                  audience: 'Công chúng quan tâm môi trường',
                  metric: 'Tiếp cận 5000+ người tham dự',
                },
                {
                  title: 'UniCare Day 2024',
                  audience: 'Sinh viên đại học',
                  metric: 'Giới thiệu đến 10,000+ sinh viên',
                },
              ].map((success, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="rounded-lg bg-foreground/5 p-4"
                >
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="font-medium text-emerald-500">
                      {success.title}
                    </h4>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                      {success.audience}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-500">
                    <TrendingUp className="h-3 w-3" />
                    {success.metric}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-auto grid gap-4 pt-4 md:grid-cols-2">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="rounded-lg bg-green-500/10 p-4 text-center"
              >
                <div className="text-2xl font-bold text-green-500">15+</div>
                <div className="text-sm font-medium">Điểm đặt máy</div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="rounded-lg bg-blue-500/10 p-4 text-center"
              >
                <div className="text-2xl font-bold text-blue-500">8,500+</div>
                <div className="text-sm font-medium">Lượt sử dụng</div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-foreground/5 p-6"
        >
          <h3 className="mb-4 text-xl font-bold">Phản hồi từ Người Dùng</h3>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                quote:
                  'Quá tiện lợi! Tôi chỉ mất 3 phút để thay nhớt, không phải chờ đợi.',
                user: 'Nguyễn Văn A',
                role: 'Tài xế Grab',
                rating: 5,
              },
              {
                quote:
                  'Tôi thích sự minh bạch của máy 3R. Biết chính xác lượng nhớt được thay.',
                user: 'Trần Thị B',
                role: 'Nhân viên văn phòng',
                rating: 4.5,
              },
              {
                quote: 'Ý tưởng thu gom nhớt thải rất tốt cho môi trường.',
                user: 'Lê Văn C',
                role: 'Sinh viên',
                rating: 5,
              },
            ].map((testimonial, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="flex flex-col justify-between rounded-lg bg-foreground/5 p-4"
              >
                <div>
                  <div className="mb-3 flex">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="text-amber-400">
                        {index < Math.floor(testimonial.rating)
                          ? '★'
                          : index === Math.floor(testimonial.rating) &&
                              testimonial.rating % 1 > 0
                            ? '★'
                            : '☆'}
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-foreground/80 italic">
                    "{testimonial.quote}"
                  </p>
                </div>
                <div className="mt-4">
                  <div className="font-medium">{testimonial.user}</div>
                  <div className="text-xs text-foreground/60">
                    {testimonial.role}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 6,
    title: 'Kế Hoạch Triển Khai',
    subtitle: 'Implementation Plan',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl bg-foreground/5 p-6 md:col-span-12"
          >
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
              <Calendar className="h-5 w-5 text-primary" />
              Lịch trình triển khai
            </h3>
            <div className="space-y-4">
              {[
                {
                  phase: 'Giai đoạn 1 (Tháng 1-2)',
                  title: 'Launch & Awareness',
                  description: 'Ra mắt, tạo sự chú ý, giới thiệu lợi ích',
                  activities: [
                    'Sự kiện ra mắt tại 5 điểm đặt máy đầu tiên',
                    'Chiến dịch PR trên báo chí và MXH',
                  ],
                  color: 'text-blue-500',
                  bgColor: 'bg-blue-500',
                  progress: 85,
                },
                {
                  phase: 'Giai đoạn 2 (Tháng 3-4)',
                  title: 'Engagement & Trial',
                  description: 'Khuyến khích dùng thử, thu thập phản hồi',
                  activities: [
                    "Chương trình 'Lần đầu sử dụng'",
                    'Challenge trên TikTok/Facebook',
                  ],
                  color: 'text-emerald-500',
                  bgColor: 'bg-emerald-500',
                  progress: 50,
                },
                {
                  phase: 'Giai đoạn 3 (Tháng 5-6)',
                  title: 'Loyalty & Advocacy',
                  description: 'Chương trình khách hàng thân thiết, giới thiệu',
                  activities: [
                    'Chương trình khách hàng thân thiết',
                    'Mở rộng thêm 10 điểm đặt máy',
                  ],
                  color: 'text-violet-500',
                  bgColor: 'bg-violet-500',
                  progress: 20,
                },
              ].map((phase, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="rounded-lg border border-foreground/10 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className={cn('text-sm font-medium', phase.color)}>
                        {phase.phase}
                      </span>
                      <h4 className="text-lg font-bold">{phase.title}</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium">
                        {phase.progress}%
                      </div>
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-foreground/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${phase.progress}%` }}
                          transition={{ delay: 0.4 + i * 0.1, duration: 1 }}
                          className={phase.bgColor}
                        />
                      </div>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-foreground/80">
                    {phase.description}
                  </p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {phase.activities.map((activity, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <Check className="mt-1 h-3 w-3 shrink-0 text-primary" />
                        <span className="text-xs text-foreground/80">
                          {activity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl bg-foreground/5 p-6"
        >
          <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
            <Megaphone className="h-5 w-5 text-primary" />
            Kênh Truyền Thông
          </h3>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <h4 className="font-semibold">Online</h4>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  {
                    channel: 'Mạng xã hội',
                    details: 'Facebook, TikTok, Zalo',
                    icon: <MessageSquare className="h-4 w-4" />,
                  },
                  {
                    channel: 'Website',
                    details: 'Thông tin, địa điểm máy',
                    icon: <Globe className="h-4 w-4" />,
                  },
                  {
                    channel: 'Online Ads',
                    details: 'Google, Facebook, TikTok',
                    icon: <Target className="h-4 w-4" />,
                  },
                  {
                    channel: 'Influencer/KOL',
                    details: 'Reviewer xe, TikToker',
                    icon: <Users className="h-4 w-4" />,
                  },
                ].map((channel, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.05 }}
                    className="flex items-start gap-2 rounded-lg bg-foreground/5 p-2.5"
                  >
                    <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary">
                      {channel.icon}
                    </div>
                    <div>
                      <div className="font-medium">{channel.channel}</div>
                      <div className="text-xs text-foreground/70">
                        {channel.details}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Offline</h4>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  {
                    channel: 'POSM',
                    details: 'Standee, banner tại điểm máy',
                    icon: <Target className="h-4 w-4" />,
                  },
                  {
                    channel: 'Sự kiện ra mắt',
                    details: 'Tổ chức tại điểm đặt máy',
                    icon: <Calendar className="h-4 w-4" />,
                  },
                  {
                    channel: 'Hội thảo',
                    details: 'Giới thiệu công nghệ',
                    icon: <Users className="h-4 w-4" />,
                  },
                  {
                    channel: 'Ngày hội thay nhớt',
                    details: 'Tại điểm đông dân cư',
                    icon: <Settings className="h-4 w-4" />,
                  },
                ].map((channel, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 + i * 0.05 }}
                    className="flex items-start gap-2 rounded-lg bg-foreground/5 p-2.5"
                  >
                    <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary">
                      {channel.icon}
                    </div>
                    <div>
                      <div className="font-medium">{channel.channel}</div>
                      <div className="text-xs text-foreground/70">
                        {channel.details}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 7,
    title: 'Tác Động Môi Trường',
    subtitle: 'Máy 3R - Góp Phần Bảo Vệ Môi Trường',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl bg-gradient-to-br from-green-500/15 via-green-500/5 to-transparent p-6"
          >
            <h3 className="mb-4 text-xl font-bold text-green-600">
              Vấn đề môi trường
            </h3>

            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="rounded-lg bg-foreground/5 p-4"
              >
                <h4 className="mb-2 font-medium text-red-500">Ô nhiễm nước</h4>
                <p className="text-sm text-foreground/80">
                  1 lít nhớt thải có thể làm ô nhiễm hơn 1 triệu lít nước sạch.
                  Khoảng 30% lượng nhớt thải từ xe máy không được xử lý đúng
                  cách.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="rounded-lg bg-foreground/5 p-4"
              >
                <h4 className="mb-2 font-medium text-red-500">Ô nhiễm đất</h4>
                <p className="text-sm text-foreground/80">
                  Nhớt thải chứa kim loại nặng và các chất độc hại, tồn tại lâu
                  trong đất và gây hại cho hệ sinh thái.
                </p>
              </motion.div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col rounded-xl bg-gradient-to-br from-blue-500/15 via-blue-500/5 to-transparent p-6"
          >
            <h3 className="mb-4 text-xl font-bold text-blue-600">
              Giải pháp từ Máy 3R
            </h3>

            <div className="space-y-4">
              {[
                {
                  title: 'Thu gom hiệu quả',
                  description:
                    'Hệ thống thu gom nhớt thải khép kín, đảm bảo 100% nhớt cũ được thu hồi và xử lý đúng quy trình.',
                  impact: 'Giảm rò rỉ nhớt ra môi trường',
                  icon: <CheckCircle className="h-5 w-5" />,
                },
                {
                  title: 'Sử dụng chính xác',
                  description:
                    'Lượng nhớt bơm vào động cơ được kiểm soát chính xác theo tiêu chuẩn, tránh lãng phí.',
                  impact: 'Giảm 15-20% lượng nhớt thừa',
                  icon: <CheckCircle className="h-5 w-5" />,
                },
                {
                  title: 'Tái chế nhớt thải',
                  description:
                    'Hợp tác với đơn vị xử lý chất thải để tái chế nhớt thải thành các sản phẩm khác.',
                  impact: 'Tái chế 70% lượng nhớt thu gom',
                  icon: <CheckCircle className="h-5 w-5" />,
                },
              ].map((solution, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="rounded-lg bg-foreground/5 p-4"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="rounded-full bg-blue-500/20 p-1 text-blue-500">
                      {solution.icon}
                    </div>
                    <h4 className="font-medium">{solution.title}</h4>
                  </div>
                  <p className="mb-2 text-sm text-foreground/80">
                    {solution.description}
                  </p>
                  <div className="flex w-fit items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-500">
                    <Globe className="h-3 w-3" />
                    {solution.impact}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="rounded-xl bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent p-6"
        >
          <h3 className="mb-4 text-center text-xl font-bold text-green-600">
            Tác động dài hạn
          </h3>

          <div className="grid gap-4 md:grid-cols-4">
            {[
              {
                metric: '70%',
                label: 'Giảm ô nhiễm từ nhớt thải',
                description: 'So với thay nhớt thủ công',
              },
              {
                metric: '1.5M',
                label: 'Lít nước sạch được bảo vệ',
                description: 'Trong 6 tháng đầu triển khai',
              },
              {
                metric: '15%',
                label: 'Giảm lượng nhớt sử dụng',
                description: 'Kiểm soát chính xác lượng nhớt',
              },
              {
                metric: '5,000+',
                label: 'Nâng cao nhận thức',
                description: 'Qua chiến dịch truyền thông',
              },
            ].map((impact, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8 + i * 0.1 }}
                className="flex flex-col items-center rounded-lg bg-foreground/5 p-4 text-center"
              >
                <div className="text-2xl font-bold text-green-500">
                  {impact.metric}
                </div>
                <div className="font-medium">{impact.label}</div>
                <div className="mt-1 text-xs text-foreground/60">
                  {impact.description}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 8,
    title: 'Tổng Kết',
    subtitle: 'Máy 3R - Cách Mạng Hóa Trải Nghiệm Thay Nhớt',
    content: (
      <div className="flex flex-col items-center justify-center gap-10">
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', duration: 0.8 }}
          className="relative"
        >
          <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-50 blur-xl" />
          <CustomLogo size="large" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col items-center gap-8"
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              { tag: 'Nhanh', color: 'bg-blue-500/10 text-blue-500' },
              { tag: 'Sạch', color: 'bg-emerald-500/10 text-emerald-500' },
              { tag: 'Xanh', color: 'bg-green-500/10 text-green-500' },
              { tag: 'Tiện lợi', color: 'bg-violet-500/10 text-violet-500' },
              { tag: 'Minh bạch', color: 'bg-amber-500/10 text-amber-500' },
              { tag: 'Hiện đại', color: 'bg-indigo-500/10 text-indigo-500' },
            ].map((item, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className={cn(
                  'rounded-full px-3 py-1 text-sm font-medium',
                  item.color
                )}
              >
                {item.tag}
              </motion.span>
            ))}
          </div>

          <div className="max-w-3xl space-y-4 text-center">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-xl leading-relaxed text-foreground/80"
            >
              Máy 3R là một{' '}
              <span className="font-semibold text-blue-500">
                giải pháp toàn diện
              </span>{' '}
              mang lại trải nghiệm thay nhớt xe máy hoàn toàn mới - kết hợp công
              nghệ tiên tiến, sự tiện lợi và bền vững.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="grid gap-6 md:grid-cols-3"
          >
            {[
              {
                title: 'Công nghệ tiên phong',
                description: 'Đầu tiên tại Việt Nam',
                icon: <Zap className="h-6 w-6" />,
                color: 'text-blue-500',
                bgColor: 'bg-blue-500/10',
              },
              {
                title: 'Giải pháp bền vững',
                description: 'Vì tương lai xanh hơn',
                icon: <Globe className="h-6 w-6" />,
                color: 'text-green-500',
                bgColor: 'bg-green-500/10',
              },
              {
                title: 'Đối tác tin cậy',
                description: 'AP Saigon Petro - Uy tín 15+ năm',
                icon: <CheckCircle className="h-6 w-6" />,
                color: 'text-amber-500',
                bgColor: 'bg-amber-500/10',
              },
            ].map((benefit, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + i * 0.1 }}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg p-4 text-center',
                  benefit.bgColor
                )}
              >
                <div
                  className={cn(
                    'rounded-full bg-background/50 p-2',
                    benefit.color
                  )}
                >
                  {benefit.icon}
                </div>
                <h4 className={cn('font-semibold', benefit.color)}>
                  {benefit.title}
                </h4>
                <p className="text-sm text-foreground/80">
                  {benefit.description}
                </p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="mt-2 flex flex-col gap-4 md:flex-row"
          >
            <Button size="lg" className="group w-full gap-2 md:w-auto">
              Khởi động chiến dịch
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </motion.div>
        </motion.div>
      </div>
    ),
  },
];

export default function PitchPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const [scale, setScale] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePaginate = (newDirection: number) => {
    if (
      (currentSlide === 0 && newDirection === -1) ||
      (currentSlide === slides.length - 1 && newDirection === 1)
    )
      return;

    setDirection(newDirection);
    setCurrentSlide(currentSlide + newDirection);
  };

  useEffect(() => {
    const calculateScale = () => {
      if (!contentRef.current) return;

      const contentHeight = contentRef.current.scrollHeight;
      const viewportHeight = window.innerHeight;
      const padding = 64; // 32px top + 32px bottom padding

      if (contentHeight > viewportHeight - padding) {
        const newScale = (viewportHeight - padding) / contentHeight;
        setScale(Math.min(1, newScale));
      } else {
        setScale(1);
      }
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [currentSlide]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePaginate(-1);
      if (e.key === 'ArrowRight') handlePaginate(1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide]);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background">
      {/* Ambient background gradients */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[30%] -left-[10%] h-[50%] w-[50%] rounded-full bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5 blur-[100px]" />
        <div className="absolute -right-[10%] -bottom-[20%] h-[40%] w-[40%] rounded-full bg-gradient-to-r from-emerald-500/5 via-teal-500/5 to-cyan-500/5 blur-[100px]" />
        <div className="absolute top-[40%] -right-[15%] h-[30%] w-[30%] rounded-full bg-gradient-to-r from-orange-500/5 via-pink-500/5 to-rose-500/5 blur-[100px]" />
      </div>

      {/* Grid pattern overlay */}
      <div className="fixed inset-0 z-0 opacity-5">
        <div className="h-full w-full bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgdmlld0JveD0iMCAwIDYwIDYwIj48cGF0aCBkPSJNNjAgMEgwdjYwaDYwVjB6TTEgNTl2LTFoMXYxSDF6bTItM3YxaC0xdi0xaDFabTAtMmgtMXYtMWgxdjF6bTItMnYxaC0xdi0xaDFabS0xLTJoLTF2LTFoMXYxem0tMS00aC0xdi0xaDF2MXptLTItNHYxaC0xdi0xaDFabTAgMnYxaC0xdi0xaDFabTEtNGgtMXYtMWgxdjF6TTMgMzVoLTF2LTFoMXYxem0wLTRoLTF2LTFoMXYxem0wLTRoLTF2LTFoMXYxem0yLTJoLTF2LTFoMXYxem0yLTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem00LTJoLTF2LTFoMXYxem02LTN2MWgtMXYtMWgxWm0tMSA1di0xaDF2MWgtMXptMSAzdjFoLTF2LTFoMVptLTEgNXYtMWgxdjFoLTF6bTEgM3YxaC0xdi0xaDFabS0xIDV2LTFoMXYxaC0xem0xIDN2MWgtMXYtMWgxWm0tMSA1di0xaDF2MWgtMXptMSAzdjFoLTF2LTFoMVptLTEgNXYtMWgxdjFoLTF6bS0yIDJoLTF2LTFoMXYxem0tNCAwdi0xaDF2MWgtMXptLTQgMGgtMXYtMWgxdjF6bS00IDB2LTFoMXYxaC0xem0tNCAwdi0xaDF2MWgtMXptLTQgMGgtMXYtMWgxdjF6bS00IDB2LTFoMXYxaC0xem0tNCAwdi0xaDF2MWgtMXptLTQgMGgtMXYtMWgxdjF6bS00IDB2LTFoMXYxaC0xem0tNCAwdi0xaDF2MWgtMXptLTQgMGgtMXYtMWgxdjF6TTcgN3YxSDZ2MUg1VjdoMlptMCAySDZ2MUg1di0xaDJabS0yIDJ2LTFoMXYxSDVabTIgMEg2djFINXYtMWgyWm0wIDJINnYxSDV2LTFoMlptLTIgMnYtMWgxdjFINVptNDggMzdoMXYxaC0xdi0xem0wIDJoMXYxaC0xdi0xem0tMiAydi0xaDF2MWgtMXptMC0ydi0xaDF2MWgtMXptLTIgMmgtMXYtMWgxdjF6bS0yIDBoLTF2LTFoMXYxem0tMi0yaC0xdi0xaDF2MXptLTItMnYxaC0xdi0xaDFabTQgMGgxdjFoLTF2LTF6bTAgMmgxdjFoLTF2LTF6bS0yLTJ2LTFoMXYxaC0xem0tMi00di0xaDF2MWgtMXptLTItMnYtMWgxdjFoLTF6bS0yLTJ2LTFoMXYxaC0xem0tMi0yaC0xdi0xaDF2MXptLTItMmgtMXYtMWgxdjF6bS0yLTJoLTF2LTFoMXYxem0tNC00aC0xdi0xaDF2MXptLTItMmgtMXYtMWgxdjF6bS0yLTJoLTF2LTFoMXYxem0tMi0yaC0xdi0xaDF2MXptLTItMmgtMXYtMWgxdjF6bS0yLTJoLTF2LTFoMXYxem0tMi0yaC0xdi0xaDF2MXptLTItMnYxaC0xdi0xaDFabTAgMnYxaC0xdi0xaDFabS0yIDJ2LTFoMXYxaC0xem0yIDB2MWgtMXYtMWgxWm0wIDJ2MWgtMXYtMWgxWm0tMiAydi0xaDF2MWgtMXptMjcgMTFoMXYxaC0xdi0xem0wLTRoMXYxaC0xdi0xem0tNC00di0xaDF2MWgtMXptLTQtNHYtMWgxdjFoLTF6bS00LTR2LTFoMXYxaC0xem00IDBoMXYxaC0xdi0xem00IDBoMXYxaC0xdi0xem00IDRoMXYxaC0xdi0xem0wIDRoMXYxaC0xdi0xem0tOC04di0xaDF2MWgtMXptNCAwdjFoLTF2LTFoMVptLTQgNHYxaC0xdi0xaDFabTAgNHYxaC0xdi0xaDFabTQgMHYxaC0xdi0xaDFabTggOGgxdjFoLTF2LTF6bTAtNGgxdjFoLTF2LTF6bTQgMGgxdjFoLTF2LTF6bTAgNGgxdjFoLTF2LTF6bTQgMGgxdjFoLTF2LTF6bTAtNGgxdjFoLTF2LTF6bS0xNiAxMnYtMWgxdjFoLTF6bTQgMHYtMWgxdjFoLTF6bTQgMHYtMWgxdjFoLTF6bTQgMHYtMWgxdjFoLTF6bTQgMHYtMWgxdjFoLTF6Ii8+PC9zdmc+')]" />
      </div>

      <div className="absolute top-0 right-0 left-0 z-50 flex items-center justify-between bg-gradient-to-b from-background/90 via-background/70 to-transparent px-4 py-3">
        <div className="flex items-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md">
            <span className="text-xs font-bold">3R</span>
          </div>
          <div className="ml-3 hidden text-sm font-medium md:block">
            <span className="opacity-60">Máy 3R |</span>{' '}
            <span>{slides[currentSlide]?.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center rounded-full bg-foreground/5 px-3 py-1 md:flex">
            <span className="text-xs font-medium">
              Slide {currentSlide + 1}/{slides.length}
            </span>
          </div>
          <ThemeToggle forceDisplay={true} />
        </div>
      </div>

      <button
        onClick={() => handlePaginate(-1)}
        className={cn(
          'absolute left-4 z-20 rounded-full p-3 transition-all duration-300',
          'group bg-gradient-to-r from-background/80 to-background/80 backdrop-blur-sm',
          'border border-foreground/10 shadow-sm',
          'disabled:pointer-events-none disabled:opacity-0',
          'hover:scale-110 hover:bg-foreground/5 active:scale-95'
        )}
        disabled={currentSlide === 0}
      >
        <div className="relative overflow-hidden rounded-full">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 opacity-0 transition-opacity group-hover:opacity-100" />
          <ArrowLeft className="relative h-6 w-6" />
        </div>
      </button>

      <button
        onClick={() => handlePaginate(1)}
        className={cn(
          'absolute right-4 z-20 rounded-full p-3 transition-all duration-300',
          'group bg-gradient-to-r from-background/80 to-background/80 backdrop-blur-sm',
          'border border-foreground/10 shadow-sm',
          'disabled:pointer-events-none disabled:opacity-0',
          'hover:scale-110 hover:bg-foreground/5 active:scale-95'
        )}
        disabled={currentSlide === slides.length - 1}
      >
        <div className="relative overflow-hidden rounded-full">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 opacity-0 transition-opacity group-hover:opacity-100" />
          <ArrowRight className="relative h-6 w-6" />
        </div>
      </button>

      <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
        <div className="flex flex-wrap justify-center gap-2 rounded-full border border-foreground/10 bg-background/70 px-3 py-2 shadow-lg backdrop-blur-md">
          {slides.map((slide, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={cn(
                'group flex items-center gap-1.5 rounded-full transition-all duration-300',
                currentSlide === index
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1'
                  : 'bg-foreground/10 px-2 py-1 hover:bg-foreground/20'
              )}
              aria-label={`Go to slide ${index + 1}: ${slide.title}`}
            >
              <div
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  currentSlide === index
                    ? 'bg-white'
                    : 'bg-foreground/40 group-hover:bg-foreground/60'
                )}
              />
              {currentSlide === index && (
                <span className="text-xs font-medium text-white">
                  {slide.title}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={currentSlide}
          custom={direction}
          variants={SLIDE_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: 'spring', stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden p-8 pt-16 pb-16 md:p-16 md:pt-20 md:pb-16"
        >
          <div
            ref={contentRef}
            className="flex max-w-6xl flex-col items-center gap-12"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              transition: 'transform 0.3s ease-out',
            }}
          >
            <div className="text-center">
              <motion.h1
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-4 text-4xl font-bold md:text-5xl lg:text-6xl"
              >
                <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent">
                  {slides[currentSlide]?.title}
                </span>
              </motion.h1>
              {slides[currentSlide]?.subtitle && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="text-xl text-foreground/70 md:text-2xl"
                >
                  {slides[currentSlide]?.subtitle}
                </motion.p>
              )}
            </div>

            <SlideWrapper>{slides[currentSlide]?.content}</SlideWrapper>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
