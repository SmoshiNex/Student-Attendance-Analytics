export default function WelcomeSection({ teacherFirstName, teacherLastName }) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return (
        <div className="bg-white rounded-lg p-6 mb-6">
            <h1 className="text-2xl font-bold">Welcome back, Professor {teacherFirstName} {teacherLastName}!</h1>
            <p className="text-gray-600">{currentDate}</p>
        </div>
    );
}