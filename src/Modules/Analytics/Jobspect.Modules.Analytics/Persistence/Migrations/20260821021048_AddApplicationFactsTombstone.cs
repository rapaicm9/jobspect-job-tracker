using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jobspect.Modules.Analytics.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddApplicationFactsTombstone : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deleted_at",
                schema: "analytics",
                table: "application_facts",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "deleted_at",
                schema: "analytics",
                table: "application_facts");
        }
    }
}
