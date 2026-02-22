"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiDownload, FiMusic, FiMic } from "react-icons/fi";

const links = [
    { href: "/download", label: "Download", icon: FiDownload },
    { href: "/stems", label: "Stems", icon: FiMusic },
    { href: "/karaoke", label: "Karaoke", icon: FiMic },
];

export default function Navbar() {
    const pathname = usePathname();

    return (
        <nav className="navbar">
            <div className="navbar-content">
                <Link href="/" className="navbar-brand">
                    YTDLStem
                </Link>
                <div className="navbar-links">
                    {links.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={`navbar-link ${pathname === link.href ? "active" : ""}`}
                        >
                            <link.icon size={16} />
                            {link.label}
                        </Link>
                    ))}
                </div>
            </div>
        </nav>
    );
}
