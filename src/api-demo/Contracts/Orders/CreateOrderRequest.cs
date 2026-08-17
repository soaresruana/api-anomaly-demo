namespace ApiDemo.Contracts.Orders;

public class CreateOrderRequest
{
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public string? Notes { get; set; }
}