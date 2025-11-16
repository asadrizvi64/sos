/**
 * Modal Utilities
 * React context and hooks for managing modals globally
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AlertModal } from '../components/ui/AlertModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { PromptModal } from '../components/ui/PromptModal';

interface ModalContextType {
  alert: (message: string, title?: string, type?: 'info' | 'success' | 'warning' | 'error') => Promise<void>;
  confirm: (message: string, title?: string, type?: 'danger' | 'warning' | 'info') => Promise<boolean>;
  prompt: (message: string, title?: string, defaultValue?: string, placeholder?: string, type?: 'text' | 'password' | 'textarea') => Promise<string | null>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    resolve: () => void;
  } | null>(null);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
    type?: 'danger' | 'warning' | 'info';
    resolve: (value: boolean) => void;
  } | null>(null);

  const [promptState, setPromptState] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
    defaultValue?: string;
    placeholder?: string;
    type?: 'text' | 'password' | 'textarea';
    resolve: (value: string | null) => void;
  } | null>(null);

  const alert = useCallback(
    (message: string, title?: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
      return new Promise<void>((resolve) => {
        setAlertState({
          isOpen: true,
          message,
          title,
          type,
          resolve: () => {
            setAlertState(null);
            resolve();
          },
        });
      });
    },
    []
  );

  const confirm = useCallback(
    (message: string, title?: string, type: 'danger' | 'warning' | 'info' = 'info') => {
      return new Promise<boolean>((resolve) => {
        setConfirmState({
          isOpen: true,
          message,
          title,
          type,
          resolve: (value: boolean) => {
            setConfirmState(null);
            resolve(value);
          },
        });
      });
    },
    []
  );

  const prompt = useCallback(
    (
      message: string,
      title?: string,
      defaultValue: string = '',
      placeholder: string = '',
      type: 'text' | 'password' | 'textarea' = 'text'
    ) => {
      return new Promise<string | null>((resolve) => {
        setPromptState({
          isOpen: true,
          message,
          title,
          defaultValue,
          placeholder,
          type,
          resolve: (value: string | null) => {
            setPromptState(null);
            resolve(value);
          },
        });
      });
    },
    []
  );

  return (
    <ModalContext.Provider value={{ alert, confirm, prompt }}>
      {children}
      
      {/* Alert Modal */}
      {alertState && (
        <AlertModal
          isOpen={alertState.isOpen}
          onClose={alertState.resolve}
          message={alertState.message}
          title={alertState.title}
          type={alertState.type}
        />
      )}

      {/* Confirm Modal */}
      {confirmState && (
        <ConfirmModal
          isOpen={confirmState.isOpen}
          onClose={() => confirmState.resolve(false)}
          onConfirm={() => confirmState.resolve(true)}
          message={confirmState.message}
          title={confirmState.title}
          type={confirmState.type}
        />
      )}

      {/* Prompt Modal */}
      {promptState && (
        <PromptModal
          isOpen={promptState.isOpen}
          onClose={() => promptState.resolve(null)}
          onConfirm={(value) => promptState.resolve(value)}
          message={promptState.message}
          title={promptState.title}
          defaultValue={promptState.defaultValue}
          placeholder={promptState.placeholder}
          type={promptState.type}
        />
      )}
    </ModalContext.Provider>
  );
}

export function useModals() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModals must be used within a ModalProvider');
  }
  return context;
}

