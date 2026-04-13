import { Button } from "@/Components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/Components/ui/dialog"
import { Input } from "@/Components/ui/input"
import { Label } from "@/Components/ui/label"
import { useState } from "react"
import axios from "axios"
import { SuccessModal, ErrorModal } from "@/Components/ui/AppModals"

import { teacherClassApiUrl } from "@/lib/nativeApi"

export default function CreateClassModal({ isOpen, onClose }) {
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

  const updateField = (field, value) => {
    setData((prev) => ({ ...prev, [field]: value }))
  }

  const resetForm = () => {
    setData({
      class_code: "",
      class_name: "",
      subject_name: "",
      schedule: "",
      room: "",
    })
    setErrors({})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setProcessing(true)
    setErrors({})

    try {
      await axios.post(teacherClassApiUrl(), data, { withCredentials: true })
      resetForm()
      onClose()
      setSuccessModal(true)
    } catch (error) {
      onClose()
      setErrorModal({
        open: true,
        message: error?.response?.data?.message || "Failed to create class.",
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
            <DialogTitle>Create New Class</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="class_code">Class Code</Label>
              <Input
                id="class_code"
                placeholder="e.g., CS 101"
                value={data.class_code}
                onChange={(e) => updateField("class_code", e.target.value)}
              />
              {errors.class_code && (
                <p className="text-sm text-red-500">{errors.class_code}</p>
              )}
            </div>

            <div>
              <Label htmlFor="class_name">Class Name (Optional)</Label>
              <Input
                id="class_name"
                placeholder="e.g., CS 101 - Section A"
                value={data.class_name}
                onChange={(e) => updateField("class_name", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="subject_name">Subject Name</Label>
              <Input
                id="subject_name"
                placeholder="e.g., Introduction to Programming"
                value={data.subject_name}
                onChange={(e) => updateField("subject_name", e.target.value)}
              />
              {errors.subject_name && (
                <p className="text-sm text-red-500">{errors.subject_name}</p>
              )}
            </div>

            <div>
              <Label htmlFor="schedule">Schedule</Label>
              <Input
                id="schedule"
                placeholder="e.g., MWF 8:00-10:00 AM"
                value={data.schedule}
                onChange={(e) => updateField("schedule", e.target.value)}
              />
              {errors.schedule && (
                <p className="text-sm text-red-500">{errors.schedule}</p>
              )}
            </div>

            <div>
              <Label htmlFor="room">Room (Optional)</Label>
              <Input
                id="room"
                placeholder="e.g., Room 301"
                value={data.room}
                onChange={(e) => updateField("room", e.target.value)}
              />
              {errors.room && (
                <p className="text-sm text-red-500">{errors.room}</p>
              )}
            </div>

            {errors.form && (
              <p className="text-sm text-red-500">{errors.form}</p>
            )}

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                className="bg-black hover:bg-gray-900 text-white"
                type="submit"
                disabled={processing}
              >
                Create Class
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <SuccessModal
        open={successModal}
        title="Class Created!"
        message="Your new class has been created successfully."
        onClose={() => setSuccessModal(false)}
      />
      <ErrorModal
        open={errorModal.open}
        title="Failed to Create Class"
        message={errorModal.message}
        onClose={() => setErrorModal({ open: false, message: "" })}
      />
    </>
  )
}
