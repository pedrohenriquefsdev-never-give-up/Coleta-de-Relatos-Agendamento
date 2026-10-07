"use client";
import { X } from "lucide-react";
export default function Modal({ title, children, onClose, footer }: { title: string; children: React.ReactNode; onClose: () => void; footer?: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="modal"><div className="modal-head"><h3>{title}</h3><button className="btn" onClick={onClose}><X size={17}/></button></div><div className="modal-body">{children}</div>{footer && <div className="modal-foot">{footer}</div>}</div>
  </div>;
}
