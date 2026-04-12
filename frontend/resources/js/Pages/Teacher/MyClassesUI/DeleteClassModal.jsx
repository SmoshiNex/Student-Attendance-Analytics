import { ConfirmModal } from "@/Components/ui/AppModals";

export default function DeleteClassModal({ isOpen, onClose, classItem, onConfirm }) {
    return (
        <ConfirmModal
            open={isOpen}
            title="Delete Class"
            message={`Are you sure you want to delete ${classItem?.class_code}? This action cannot be undone.`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            danger={true}
            onConfirm={onConfirm}
            onCancel={onClose}
        />
    );
}
