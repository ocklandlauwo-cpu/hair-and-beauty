<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\StoreExpenseRequest;
use App\Models\Expense;
use Illuminate\Http\JsonResponse;

class ExpenseController extends Controller
{
    private const FIELDS = ['id', 'location_id', 'category', 'amount', 'expense_date', 'recorded_by', 'notes'];

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Expense::class);
        $expenses = Expense::with('location')->latest('expense_date')->paginate(50);
        $paged = $expenses->through(fn ($e) => array_merge(
            $e->only(self::FIELDS),
            [
                'expense_date'  => $e->expense_date->format('Y-m-d'),
                'location_name' => $e->location?->name,
            ],
        ));

        return response()->json([
            'data' => $paged->items(),
            'meta' => [
                'current_page' => $paged->currentPage(),
                'last_page' => $paged->lastPage(),
                'per_page' => $paged->perPage(),
                'total' => $paged->total(),
            ],
        ]);
    }

    public function store(StoreExpenseRequest $request): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validated();

        // Admin may specify any location; all others default to their own
        $locationId = ($user->role === 'admin' && isset($validated['location_id']))
            ? $validated['location_id']
            : $user->location_id;

        $expense = Expense::create([
            'location_id' => $locationId,
            'category' => $validated['category'],
            'amount' => $validated['amount'],
            'expense_date' => $validated['expense_date'],
            'recorded_by' => $user->id,
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json(['data' => array_merge(
            $expense->only(self::FIELDS),
            ['expense_date' => $expense->expense_date->format('Y-m-d')],
        )], 201);
    }

    public function show(Expense $expense): JsonResponse
    {
        $this->authorize('viewAny', Expense::class);

        return response()->json(['data' => array_merge(
            $expense->only(self::FIELDS),
            ['expense_date' => $expense->expense_date->format('Y-m-d')],
        )]);
    }
}
