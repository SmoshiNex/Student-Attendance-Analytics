<?php
class Database
{
    private $host = "localhost";
    private $username = "root";
    private $password = "";
    private $database = "student_attendance_analytics";
    private $charset = "utf8mb4";
    private $conn;

    public function connect()
    {
        try {
            if (!$this->conn) {
                $dsn = "mysql:host={$this->host};dbname={$this->database};charset={$this->charset}";
                $this->conn = new PDO(
                    $dsn,
                    $this->username,
                    $this->password,
                    array(PDO::ATTR_PERSISTENT => true)
                );

                $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $this->conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            }

            return $this->conn;
        } catch (PDOException $e) {
            error_log("Database Connection Error: " . $e->getMessage());
            throw new PDOException("Connection failed: " . $e->getMessage());
        }
    }
}
