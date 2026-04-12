import LoginModal from "@/Components/auth/LoginModal";

export default function Login({ status }) {
    return (
        <>
            <LoginModal />
            {status && (
                <div className="fixed top-4 right-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-md">
                    {status}
                </div>
            )}
        </>
    );
}
