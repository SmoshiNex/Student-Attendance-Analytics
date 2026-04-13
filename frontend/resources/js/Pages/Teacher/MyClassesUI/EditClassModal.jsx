import { Button } from "@/Components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/Components/ui/dialog"
import { Input } from "@/Components/ui/input"
import { Label } from "@/Components/ui/label"
import { useEffect, useState } from "react"
import axios from "axios"
import { SuccessModal, ErrorModal } from "@/Components/ui/AppModals"

import { teacherClassApiUrl } from "@/lib/nativeApi"

export default function EditClassModal({ isOpen, onClose, classItem }) {
  const [data, setData] = useState({
    class_code: "",
    class_name: "",
    subject_name: "",
    schedule: "",
    room: "",
  })
  const [processing, setProcessing] = useState(false)
  const [errors, setErrors] = useState({})
  const [successModal, setSuccessModal] = useState(false)
  const [errorModal, setErrorModal] = useState({ open: false, message: "" })

  useEffect(() => {
    setData({
      class_code: classItem?.class_code || "",
      class_name: classItem?.class_name || "",
      subject_name: classItem?.subject_name || "",
      schedule: classItem?.schedule || "",
      room: classItem?.room || "",
    })
    setErrors({})
  }, [classItem])

  const updateField = (field, value) =>
    setData((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!classItem?.id) return
    setProcessing(true)
    setErrors({})
    try {
      await axios.patch(teacherClassApiUrl({ id: classItem.id }), data, {
        withCredentials: true,
      })
      onClose()
      setSuccessModal(true)
    } catch (error) {
      onClose()
      setErrorModal({
        open: true,
        message: error?.response?.data?.message || "Failed to update class.",
      })
    } finally {
      setProcessing(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Class</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="edit_class_code">Class Code</Label>
              <Input
                id="edit_class_code"
                placeholder="e.g., CS 101"
                value={data.class_code}
                onChange={(e) => updateField("class_code", e.target.value)}
              />
              {errors.class_code && (
                <p className="text-sm text-red-500">{errors.class_code}</p>
              )}
            </div>

            <div>
              <Label htmlFor="edit_class_name">Class Name (Optional)</Label>
              <Input
                id="edit_class_name"
                placeholder="e.g., CS 101 - Section A"
                value={data.class_name}
                onChange={(e) => updateField("class_name", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="edit_subject_name">Subject Name</Label>
              <Input
                id="edit_subject_name"
                placeholder="e.g., Introduction to Programming"
                value={data.subject_name}
                onChange={(e) => updateField("subject_name", e.target.value)}
              />
              {errors.subject_name && (
                <p className="text-sm text-red-500">{errors.subject_name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="edit_schedule">Schedule</Label>
              <Input
                id="edit_schedule"
                placeholder="e.g., MWF 8:00-10:00 AM"
                value={data.schedule}
                onChange={(e) => updateField("schedule", e.target.value)}
              />
              {errors.schedule && (
                <p className="text-sm text-red-500">{errors.schedule}</p>
              )}
            </div>

            <div>
              <Label htmlFor="edit_room">Room (Optional)</Label>
              <Input
                id="edit_room"
                placeholder="e.g., Room 301"
                value={data.room}
                onChange={(e) => updateField("room", e.target.value)}
              />
              {errors.room && (
                <p className="text-sm text-red-500">{errors.room}</p>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={processing}>
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <SuccessModal
        open={successModal}
        title="Class Updated!"
        message="Your class has been updated successfully."
        onClose={() => setSuccessModal(false)}
      />
      <ErrorModal
        open={errorModal.open}
        title="Failed to Update Class"
        message={errorModal.message}
        onClose={() => setErrorModal({ open: false, message: "" })}
      />
    </>
  )
}
