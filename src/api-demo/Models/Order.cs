namespace ApiDemo.Models;

public class Order
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public int Quantity { get; set; }
    public string? Notes { get; set; }
    public DateTime CreateAt { get; set; }
}