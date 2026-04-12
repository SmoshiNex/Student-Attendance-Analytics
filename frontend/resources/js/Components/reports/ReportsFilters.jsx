import { Card, CardContent, CardHeader, CardTitle } from "@/Components/ui/card";
import { Label } from "@/Components/ui/label";
import { Input } from "@/Components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/Components/ui/select";
import { Button } from "@/Components/ui/button";
import { Filter, X } from "lucide-react";

export default function ReportsFilters({
    classes = [],
    filters,
    onClassChange,
    onDateChange,
    onClear,
    isLoading,
}) {
    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Filter Controls
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Label htmlFor="class_id">Class</Label>
                        <Select
                            value={filters.class_id || "all"}
                            onValueChange={onClassChange}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="All Classes" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Classes</SelectItem>
                                {classes.map((cls) => {
                                    if (!cls.id) return null;
                                    // Format class name: class_name OR (class_code - subject_name) OR subject_name OR class_code
                                    let displayName = cls.class_name;
                                    if (!displayName) {
                                        if (cls.class_code && cls.subject_name) {
                                            displayName = `${cls.class_code} - ${cls.subject_name}`;
                                        } else {
                                            displayName = cls.subject_name || cls.class_code || "Unnamed Class";
                                        }
                                    }
                                    return (
                                        <SelectItem key={cls.id} value={cls.id.toString()}>
                                            {displayName}
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="date">Date (MM-DD-YYYY)</Label>
                        <Input
                            type="date"
                            id="date"
                            value={filters.date || ""}
                            onChange={(e) => onDateChange(e.target.value)}
                            placeholder="MM-DD-YYYY"
                        />
                    </div>

                    <div className="flex items-end">
                        <Button
                            variant="outline"
                            onClick={onClear}
                            disabled={isLoading}
                        >
                            <X className="w-4 h-4 mr-2" />
                            Clear Filters
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
