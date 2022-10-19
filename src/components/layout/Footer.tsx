import Link from 'next/link';

interface FooterProps {
    className?: string;
}

export default function Footer({ className }: FooterProps) {
    return (
        <div
            className={`${className} overflow-hidden w-full h-16 border-b border-zinc-800/80 bg-zinc-900 p-7 bottom-0 items-center flex`}
        >
            <div className="">
                <span>Made with ❤️ by </span>
                <span className="font-semibold">
                    <Link href="https://www.tuturuuu.com">Tuturuuu</Link>
                </span>
            </div>
        </div>
    );
}
