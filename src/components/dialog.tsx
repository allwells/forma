"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons";

export function Dialog({
  children,
  onClose,
  title,
  drawer = false,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const active = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={drawer ? "dialog cart-dialog" : "dialog product-dialog"}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <button
        className="icon-button dialog-close"
        aria-label={`Close ${title}`}
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      {children}
    </dialog>
  );
}
