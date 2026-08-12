using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Jobspect.Modules.Applications.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDeadlineSortIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_applications_owner_id_application_deadline_id",
                schema: "applications",
                table: "applications",
                columns: new[] { "owner_id", "application_deadline", "id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_applications_owner_id_application_deadline_id",
                schema: "applications",
                table: "applications");
        }
    }
}
