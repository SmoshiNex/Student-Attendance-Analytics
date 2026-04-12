import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/Components/ui/dialog";
import { Button } from "@/Components/ui/button";
import { Input } from "@/Components/ui/input";
import { Label } from "@/Components/ui/label";
import { useForm } from '@inertiajs/react';

export default function LoginModal() {
    const [open, setOpen] = useState(false);
    const { data, setData, post, processing, errors, reset } = useForm({
        student_id: '',
        password: '',
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        post('/student/login', {
            onSuccess: () => {
                setOpen(false);
                reset();
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline">Student Login</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Student Login</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="student_id">Student ID</Label>
                        <Input 
                            id="student_id"
                            type="text" 
                            value={data.student_id}
                            onChange={e => setData('student_id', e.target.value)}
                            placeholder="Enter your student ID"
                        />
                        {errors.student_id && <p className="text-sm text-red-500">{errors.student_id}</p>}
                    </div>
                    <div>
                        <Label htmlFor="password">Password</Label>
                        <Input 
                            id="password"
                            type="password" 
                            value={data.password}
                            onChange={e => setData('password', e.target.value)}
                            placeholder="Enter your password"
                        />
                        {errors.password && <p className="text-sm text-red-500">{errors.password}</p>}
                    </div>
                    <Button type="submit" disabled={processing}>
                        Login
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}